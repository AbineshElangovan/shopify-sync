import { NextRequest, NextResponse } from "next/server";
import { verifyWebhook } from "@/lib/shopify/webhooks";
import { prisma } from "@/lib/db/prisma";
import { syncStoreProducts } from "@/services/shopify";

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

    // Trigger a full product re-sync in the background so ProductCache & VariantMap stay current.
    // We respond 200 immediately so Shopify does not retry.
    syncStoreProducts(shop).then((result) => {
      console.log(`[Webhook:products/update] sync complete for ${shop}`, result);
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
