import { NextRequest, NextResponse } from "next/server";
import { verifyWebhook } from "@/lib/shopify/webhooks";
import { prisma } from "@/lib/db/prisma";
import { processProductDelete } from "@/services/product-sync";

export async function POST(req: NextRequest) {
  try {
    const { topic, shop, webhookId, rawBody } = await verifyWebhook(req);

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

    const payload = JSON.parse(rawBody);
    console.log(`[Webhook:products/delete] shop=${shop} productId=${payload?.id}`);

    // Replicate deletion to target stores
    processProductDelete(shop, payload, webhookId).then(() => {
      console.log(`[Webhook:products/delete] sync complete for ${shop}`);
    }).catch((err) => {
      console.error(`[Webhook:products/delete] sync failed for ${shop}:`, err.message);
    });

    return new NextResponse("Webhook processed successfully", { status: 200 });
  } catch (error: any) {
    console.error("[Webhook:products/delete] error:", error.message);
    if (error.message === "Webhook signature verification failed.") {
      return new NextResponse("Unauthorized", { status: 401 });
    }
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
