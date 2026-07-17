import { NextRequest, NextResponse } from "next/server";
import { verifyWebhook } from "@/lib/shopify/webhooks";
import { prisma } from "@/lib/db/prisma";
import { processProductDelete, hasSyncLock, releaseSyncLock } from "@/services/product-sync";

export async function POST(req: NextRequest) {
  try {
    const { topic, shop, webhookId, rawBody } = await verifyWebhook(req);

    // Guard: Only allow synchronization from the Master Store
    const store = await prisma.store.findUnique({
      where: { shopDomain: shop },
    });

    const payload = JSON.parse(rawBody);
    
    if (!(store as any)?.isMaster) {
      console.log(`[Webhook:products/delete] Cleaning up local cache for Sub Store: ${shop}`);
      const deletedGid = `gid://shopify/Product/${payload.id}`;
      
      // We must clean up our local cache so the Dashboard metrics update correctly for Sub Stores
      await prisma.variantMap.deleteMany({
        where: {
          storeId: store?.id,
          shopifyProductId: deletedGid,
        },
      });

      await prisma.productCache.deleteMany({
        where: {
          storeId: store?.id,
          shopifyProductId: deletedGid,
        },
      });

      return new NextResponse("Ignored sync but cleaned up local cache", { status: 200 });
    }

    // Idempotency: skip if already processed
    const existingEvent = await prisma.webhookEvent.findUnique({
      where: { id: webhookId },
    });

    if (existingEvent) {
      console.log(`[Webhook:products/delete] ${webhookId} already processed.`);
      return new NextResponse("Already processed", { status: 200 });
    }

    // Record event to prevent duplicate processing
    await prisma.webhookEvent.create({
      data: { id: webhookId, topic, shopDomain: shop },
    });

    console.log(`[Webhook:products/delete] shop=${shop} productId=${payload?.id}`);

    // Loop prevention: check if this is an internally triggered sync deletion
    const productGid = `gid://shopify/Product/${payload.id}`;
    if (hasSyncLock(shop, productGid, "DELETE")) {
      console.log(`[Webhook:products/delete] Ignored internally triggered deletion to prevent loop for ${shop} (Product ID: ${payload.id})`);
      releaseSyncLock(shop, productGid, "DELETE");
      return new NextResponse("Ignored sync loop", { status: 200 });
    }

    // Replicate deletion to target stores
    try {
      await processProductDelete(shop, payload, webhookId);
      console.log(`[Webhook:products/delete] sync complete for ${shop}`);
    } catch (err: any) {
      console.error(`[Webhook:products/delete] sync failed for ${shop}:`, err.message);
    }

    return new NextResponse("Webhook processed successfully", { status: 200 }); // Hot reload trigger
  } catch (error: any) {
    console.error("[Webhook:products-delete] error:", error.message);
    if (error.message === "Webhook signature verification failed.") {
      return new NextResponse("Unauthorized", { status: 401 });
    }
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
