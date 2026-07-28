import { NextRequest, NextResponse } from "next/server";
import { verifyWebhook } from "@/lib/shopify/webhooks";
import { prisma } from "@/lib/db/prisma";
import { processWebhookQueue } from "@/services/webhook-worker";

export async function POST(req: NextRequest) {
  try {
    const { topic, shop, webhookId, rawBody } = await verifyWebhook(req);
    const apiVersion = req.headers.get("x-shopify-api-version") || null;

    try {
      await prisma.webhookQueue.create({
        data: {
          webhookId,
          topic,
          shopDomain: shop,
          apiVersion,
          payload: JSON.parse(rawBody),
          status: "PENDING",
        },
      });
      console.log(`[Webhook:${topic}] Queued ${webhookId} for ${shop}`);
      processWebhookQueue().catch(console.error);
    } catch (e: any) {
      if (e.code === 'P2002') {
        console.log(`[Webhook:${topic}] Duplicate webhook ignored: ${webhookId}`);
      } else {
        throw e;
      }
    }

    return new NextResponse("Webhook processed successfully", { status: 200 });
  } catch (error: any) {
    console.error("[Webhook:products-create] error:", error.message);
    if (error.message === "Webhook signature verification failed.") {
      return new NextResponse("Unauthorized", { status: 401 });
    }
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
