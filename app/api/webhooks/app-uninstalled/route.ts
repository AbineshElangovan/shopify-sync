import { NextRequest, NextResponse } from "next/server";
import { verifyWebhook } from "@/lib/shopify/webhooks";
import { prisma } from "@/lib/db/prisma";
import { logAuthEvent } from "@/lib/auth/audit";

export async function POST(req: NextRequest) {
  try {
    const { topic, shop, webhookId } = await verifyWebhook(req);

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

    console.log(`Processing app uninstalled for shop ${shop}`);
    
    // Find the store being uninstalled
    const store = await prisma.store.findUnique({
      where: { shopDomain: shop }
    });

    if (store) {
      // 1. Remove all existing StoreConnection records for this store
      await prisma.storeConnection.deleteMany({
        where: {
          OR: [
            { sourceStoreId: store.id },
            { targetStoreId: store.id }
          ]
        }
      });

      // 2. Invalidate the previous uniqueStoreId and mark inactive
      const invalidatedId = `${store.uniqueStoreId}-uninstalled-${Date.now()}`;
      await prisma.store.update({
        where: { id: store.id },
        data: { 
          isActive: false,
          uniqueStoreId: invalidatedId,
          authStatus: 'UNINSTALLED'
        },
      });

      // 3. Delete sessions for this shop
      await prisma.session.deleteMany({
        where: { shop },
      });

      await logAuthEvent(shop, "App Uninstalled", true, "App uninstalled webhook processed");
    }

    return new NextResponse("Webhook processed successfully", { status: 200 });
  } catch (error: any) {
    console.error("Webhook processing error:", error.message);
    if (error.message === "Webhook signature verification failed.") {
      return new NextResponse("Unauthorized", { status: 401 });
    }
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
