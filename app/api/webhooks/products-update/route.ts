import { NextRequest, NextResponse } from "next/server";
import { verifyWebhook } from "@/lib/shopify/webhooks";
import { prisma } from "@/lib/db/prisma";

export async function POST(req: NextRequest) {
  try {
    const { topic, shop, webhookId, rawBody } = await verifyWebhook(req);

    // Check if the event was already processed
    const existingEvent = await prisma.webhookEvent.findUnique({
      where: { id: webhookId },
    });

    if (existingEvent) {
      console.log(`Webhook ${webhookId} already processed.`);
      return new NextResponse("Already processed", { status: 200 });
    }

    // Save the event to prevent duplicate processing
    await prisma.webhookEvent.create({
      data: {
        id: webhookId,
        topic,
        shopDomain: shop,
      },
    });

    const payload = JSON.parse(rawBody);
    console.log(`Processing products update for shop ${shop}:`, payload);
    
    // Trigger any specific product sync logic here if needed

    return new NextResponse("Webhook processed successfully", { status: 200 });
  } catch (error: any) {
    console.error("Webhook processing error:", error.message);
    if (error.message === "Webhook signature verification failed.") {
      return new NextResponse("Unauthorized", { status: 401 });
    }
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
