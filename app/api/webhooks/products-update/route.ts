import { NextRequest, NextResponse } from "next/server";
import { verifyWebhook } from "@/lib/shopify/webhooks";
import { prisma } from "@/lib/db/prisma";
import { processProductUpdate, processProductDelete, hasSyncLock, releaseSyncLock, updateLocalProductCache, withLock } from "@/services/product-sync";
import { requireProductIdentity } from "@/services/product-identity";

export async function POST(req: NextRequest) {
  try {
    const { topic, shop, webhookId, rawBody } = await verifyWebhook(req);

    // Guard: Only allow synchronization from the Master Store
    const store = await prisma.store.findUnique({
      where: { shopDomain: shop },
    });

    if (!(store as any)?.isMaster) {
      console.log(`[Webhook:products/update] Ignored event from Sub Store: ${shop}`);
      return new NextResponse("Ignored Sub Store event", { status: 200 });
    }

    // Idempotency: skip if already processed
    const existingEvent = await prisma.webhookEvent.findUnique({
      where: { id: webhookId },
    });

    if (existingEvent) {
      console.log(`[Webhook:products/update] ${webhookId} already processed.`);
      return new NextResponse("Already processed", { status: 200 });
    }

    // Record event to prevent duplicate processing
    await prisma.webhookEvent.create({
      data: { id: webhookId, topic, shopDomain: shop },
    });

    const payload = JSON.parse(rawBody);
    console.log(`[Webhook:products/update] shop=${shop} productId=${payload?.id} title="${payload?.title}"`);

    // Loop prevention: check if this is an internally triggered sync update
    const productGid = `gid://shopify/Product/${payload.id}`;
    if (hasSyncLock(shop, productGid, payload.title)) {
      console.log(`[Webhook:products/update] Ignored internally triggered update to prevent infinite loop for ${shop} (Product: ${payload.title})`);
      releaseSyncLock(shop, productGid, payload.title);
      return new NextResponse("Ignored sync loop", { status: 200 });
    }

    // Use withLock to prevent concurrent webhooks (like a fast update following a create) from creating duplicates
    const lockKey = `product_sync_${payload.id}`;
    await withLock(lockKey, async () => {
      try {
        if (topic === 'products/delete') {
          console.log(`[Webhook:products/update] Ignored products/delete topic (handled by products-delete route)`);
          return;
        }

        // Fetch the absolute latest source of truth from Shopify FIRST
        // This solves the race condition where the webhook payload is stale and missing the SKU
        // because it was triggered by a rapid quantity change right after creation.
        const { fetchLatestShopifyProduct } = require('@/services/shopify/product-fetcher');
        let currentPayload = payload;
        
        const latestPayload = await fetchLatestShopifyProduct(shop, payload.id);
        if (latestPayload) {
          // Shopify GraphQL is eventually consistent. If we just generated a SKU, it might be missing here.
          // Merge the original payload's SKU to prevent wiping it out.
          latestPayload.variants.forEach((latestVariant: any) => {
             const originalVariant = payload.variants?.find((v: any) => v.admin_graphql_api_id === latestVariant.admin_graphql_api_id || v.id == latestVariant.id);
             if (!latestVariant.sku && originalVariant?.sku) {
                 latestVariant.sku = originalVariant.sku;
             }
          });
          currentPayload = latestPayload;
        }

        await updateLocalProductCache(shop, currentPayload, topic);
        await processProductUpdate(shop, currentPayload, webhookId);
        
        // 1. Verify Product Unique ID exists for all variants
        const storeRecord = await prisma.store.findUnique({ where: { shopDomain: shop } });
        if (storeRecord && currentPayload.variants) {
          for (const variant of currentPayload.variants) {
            const variantIdStr = variant.admin_graphql_api_id?.split('/').pop() || String(variant.id);
            const productIdStr = String(currentPayload.id);
            const identity = await requireProductIdentity(storeRecord.id, productIdStr, variantIdStr);
            if (!identity) {
               throw new Error(`Data Inconsistency: Identity missing for variant ${variantIdStr}`);
            }
          }
        }

        console.log(`[Webhook:${topic}] sync complete for ${shop}`);
      } catch (err: any) {
        console.error(`[Webhook:${topic}] sync failed for ${shop}:`, err.message);
      }
    });

    return new NextResponse("Webhook processed successfully", { status: 200 }); // Hot reload trigger
  } catch (error: any) {
    console.error("[Webhook:products-update] error:", error.message);
    if (error.message === "Webhook signature verification failed.") {
      return new NextResponse("Unauthorized", { status: 401 });
    }
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
