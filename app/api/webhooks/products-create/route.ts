import { NextRequest, NextResponse } from "next/server";
import { verifyWebhook } from "@/lib/shopify/webhooks";
import { prisma } from "@/lib/db/prisma";
import { processProductCreate, hasSyncLock, releaseSyncLock, updateLocalProductCache, withLock } from "@/services/product-sync";
import { generateSkusForProductIfNeeded } from "@/services/sku";
import { createMasterProductMapping } from "@/services/product-mapping";
export async function POST(req: NextRequest) {
  try {
    const { topic, shop, webhookId, rawBody } = await verifyWebhook(req);

    // Guard: Only allow synchronization from the Master Store
    const store = await prisma.store.findUnique({
      where: { shopDomain: shop },
    });

    if (!(store as any)?.isMaster) {
      console.log(`[Webhook:products/create] Ignored event from Sub Store: ${shop}`);
      return new NextResponse("Ignored Sub Store event", { status: 200 });
    }

    // Idempotency: skip if already processed
    const existingEvent = await prisma.webhookEvent.findUnique({
      where: { id: webhookId },
    });

    if (existingEvent) {
      console.log(`[Webhook:products/create] ${webhookId} already processed.`);
      return new NextResponse("Already processed", { status: 200 });
    }

    // Record event to prevent duplicate processing
    await prisma.webhookEvent.create({
      data: { id: webhookId, topic, shopDomain: shop },
    });

    const payload = JSON.parse(rawBody);
    console.log(`[Webhook:products/create] shop=${shop} productId=${payload?.id} title="${payload?.title}"`);

    // Loop prevention: check if this is an internally triggered sync creation
    const productGid = `gid://shopify/Product/${payload.id}`;
    if (hasSyncLock(shop, productGid, payload.title)) {
      console.log(`[Webhook:products/create] Ignored internally triggered creation to prevent infinite loop for ${shop} (Product: ${payload.title})`);
      releaseSyncLock(shop, productGid, payload.title);
      return new NextResponse("Ignored sync loop", { status: 200 });
    }

    // Use withLock to prevent concurrent webhooks (like a fast update following a create) from creating duplicates
    const lockKey = `product_sync_${payload.id}`;
    await withLock(lockKey, async () => {
      try {
        // Fetch the absolute latest source of truth from Shopify FIRST
        // This catches inventory, collections, statuses, and any SKUs already generated
        const { fetchLatestShopifyProduct } = require('@/services/shopify/product-fetcher');
        let enrichedPayload = payload;
        
        const latestPayload = await fetchLatestShopifyProduct(shop, payload.id);
        if (latestPayload) {
          // Shopify GraphQL is eventually consistent. Merge original payload SKUs to prevent wipeout.
          latestPayload.variants.forEach((latestVariant: any) => {
             const originalVariant = payload.variants?.find((v: any) => v.admin_graphql_api_id === latestVariant.admin_graphql_api_id || v.id == latestVariant.id);
             if (!latestVariant.sku && originalVariant?.sku) {
                 latestVariant.sku = originalVariant.sku;
             }
          });
          enrichedPayload = latestPayload;
        }

        // Only generate SKUs if they are STILL missing after fetching the latest data
        enrichedPayload = await generateSkusForProductIfNeeded(shop, enrichedPayload);

        // 1. Generate Product Unique ID for all variants FIRST
        const storeRecord = await prisma.store.findUnique({ where: { shopDomain: shop } });
        if (storeRecord && enrichedPayload.variants) {
          for (const variant of enrichedPayload.variants) {
            const variantIdStr = variant.admin_graphql_api_id?.split('/').pop() || String(variant.id);
            const productIdStr = String(enrichedPayload.id);
            const inventoryItemIdStr = variant.inventory_item_id ? String(variant.inventory_item_id) : null;
            
            // Check if mapping already exists (in case of retry)
            const existingMapping = await prisma.productMapping.findUnique({
               where: { storeId_shopifyVariantId: { storeId: storeRecord.id, shopifyVariantId: variantIdStr } }
            });
            
            if (!existingMapping) {
              const mapping = await createMasterProductMapping(
                storeRecord.id, 
                productIdStr, 
                variantIdStr, 
                variant.sku || null, 
                inventoryItemIdStr
              );
              if (!mapping) {
                 throw new Error(`Failed to persist mapping for variant ${variantIdStr}`);
              }
              
              console.log(`\n======================================================`);
              console.log(`🛍️  NEW PRODUCT ADDED ON MASTER STORE`);
              console.log(`======================================================\n`);
              console.log(`[Unique ID Generation]`);
              console.log(`➡️  Generated Master Unique ID: ${mapping.productUniqueId}`);
              console.log(`➡️  For Master Product: ${enrichedPayload.title} (SKU: ${variant.sku || 'N/A'})\n`);
            }
          }
        }

        await updateLocalProductCache(shop, enrichedPayload);
        await processProductCreate(shop, enrichedPayload, webhookId);

        console.log(`[Webhook:products/create] sync complete for ${shop}`);
      } catch (err: any) {
        require('fs').appendFileSync('C:/Users/eabin/OneDrive/Desktop/next task/shopify-sync/sync-errors.log', `[${new Date().toISOString()}] products-create route error: ${err.message}\n${err.stack}\n`);
        console.error(`[Webhook:products/create] sync failed for ${shop}:`, err.message);
      }
    });

    return new NextResponse("Webhook processed successfully", { status: 200 }); // Hot reload trigger
  } catch (error: any) {
    console.error("[Webhook:products-create] error:", error.message);
    if (error.message === "Webhook signature verification failed.") {
      return new NextResponse("Unauthorized", { status: 401 });
    }
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
