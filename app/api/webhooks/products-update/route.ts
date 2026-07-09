import { NextRequest, NextResponse } from "next/server";
import { verifyWebhook } from "@/lib/shopify/webhooks";
import { prisma } from "@/lib/db/prisma";
import { processProductUpdate, hasSyncLock, releaseSyncLock, updateLocalProductCache } from "@/services/product-sync";

export async function POST(req: NextRequest) {
  try {
    const { topic, shop, webhookId, rawBody } = await verifyWebhook(req);

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

    // First update the local database cache for this store (single product)
    updateLocalProductCache(shop, payload).then(() => {
      // Replicate the updates to all other connected stores
      return processProductUpdate(shop, payload, webhookId);
    }).then(() => {
      console.log(`[Webhook:products/update] sync complete for ${shop}`);
    }).catch((err) => {
      console.error(`[Webhook:products/update] sync failed for ${shop}:`, err.message);
    });

    return new NextResponse("Webhook processed successfully", { status: 200 });
  } catch (error: any) {
    console.error("[Webhook:products/update] error:", error.message);
    if (error.message === "Webhook signature verification failed.") {
      return new NextResponse("Unauthorized", { status: 401 });
    }
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
