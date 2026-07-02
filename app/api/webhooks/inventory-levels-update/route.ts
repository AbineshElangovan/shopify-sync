import { NextRequest, NextResponse } from 'next/server';
import { verifyWebhook } from '@/lib/shopify/webhooks';
import { prisma } from '@/lib/db/prisma';
import { processInventoryUpdate } from '@/lib/shopify/sync-service';

export async function POST(req: NextRequest) {
  try {
    // Verify HMAC signature — same as every other webhook handler
    const { topic, shop, webhookId, rawBody } = await verifyWebhook(req);

    if (topic !== 'inventory_levels/update') {
      return new NextResponse('Ignored topic', { status: 200 });
    }

    // Idempotency: skip if already processed
    const existingEvent = await prisma.webhookEvent.findUnique({
      where: { id: webhookId },
    });

    if (existingEvent) {
      console.log(`[Webhook:inventory_levels/update] ${webhookId} already processed.`);
      return new NextResponse('Already processed', { status: 200 });
    }

    // Record event
    await prisma.webhookEvent.create({
      data: { id: webhookId, topic, shopDomain: shop },
    });

    const body = JSON.parse(rawBody);
    const { inventory_item_id, location_id, available } = body;

    if (!inventory_item_id || !location_id || typeof available !== 'number') {
      console.error(`[Webhook:inventory_levels/update] Invalid payload for ${shop}:`, body);
      return new NextResponse('Invalid payload', { status: 400 });
    }

    console.log(`[Webhook:inventory_levels/update] shop=${shop} item=${inventory_item_id} location=${location_id} qty=${available}`);

    // Process in background — return 200 immediately so Shopify does not retry
    processInventoryUpdate(
      shop,
      inventory_item_id.toString(),
      location_id.toString(),
      available,
      webhookId
    ).then(() => {
      console.log(`[Webhook:inventory_levels/update] sync complete for ${shop}`);
    }).catch((err: Error) => {
      console.error(`[Webhook:inventory_levels/update] sync failed for ${shop}:`, err.message);
    });

    return new NextResponse('Webhook processed', { status: 200 });
  } catch (error: any) {
    console.error('[Webhook:inventory_levels/update] error:', error.message);
    if (error.message === 'Webhook signature verification failed.') {
      return new NextResponse('Unauthorized', { status: 401 });
    }
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}