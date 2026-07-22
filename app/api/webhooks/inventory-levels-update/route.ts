import { NextRequest, NextResponse } from 'next/server';
import { verifyWebhook } from '@/lib/shopify/webhooks';
import { prisma } from '@/lib/db/prisma';
import { processInventoryUpdate } from '@/services/shopify';

export async function POST(req: NextRequest) {
  try {
    // Verify HMAC signature — same as every other webhook handler
    const { topic, shop, webhookId, rawBody } = await verifyWebhook(req);

    if (topic !== 'inventory_levels/update') {
      return new NextResponse('Ignored topic', { status: 200 });
    }


    const timestamp = new Date().toISOString();
    console.log(`\n======================================================`);
    console.log(`[Webhook:inventory_levels/update] RECEIVED at ${timestamp}`);
    console.log(`[Webhook:inventory_levels/update] Event Name: inventory_levels/update`);
    console.log(`[Webhook:inventory_levels/update] Shop Domain: ${shop}`);
    console.log(`[Webhook:inventory_levels/update] Webhook ID: ${webhookId}`);

    // Idempotency: skip if already processed
    const existingEvent = await prisma.webhookEvent.findUnique({
      where: { id: webhookId },
    });

    if (existingEvent) {
      console.log(`[Webhook:inventory_levels/update] Idempotency check: SKIPPED (Already processed)`);
      return new NextResponse('Already processed', { status: 200 });
    }

    console.log(`[Webhook:inventory_levels/update] Idempotency check: PASSED (New event)`);

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

    console.log(`[Webhook:inventory_levels/update] Inventory Item ID: ${inventory_item_id}`);
    console.log(`[Webhook:inventory_levels/update] Location ID: ${location_id}`);
    console.log(`[Webhook:inventory_levels/update] Available Quantity: ${available}`);

    // Look up Variant and Product for logging
    const inventoryItemIdStr = String(inventory_item_id);
    const gidInventoryItemId = inventoryItemIdStr.includes('gid://')
      ? inventoryItemIdStr
      : `gid://shopify/InventoryItem/${inventoryItemIdStr}`;
    
    const variantInfo = await prisma.variantMap.findFirst({
      where: { inventoryItemId: gidInventoryItemId, store: { shopDomain: shop } },
    });

    if (variantInfo) {
      console.log(`[Webhook:inventory_levels/update] Variant ID: ${variantInfo.shopifyVariantId}`);
      console.log(`[Webhook:inventory_levels/update] Product ID: ${variantInfo.shopifyProductId}`);
      console.log(`[Webhook:inventory_levels/update] SKU: ${variantInfo.sku}`);
    } else {
      console.log(`[Webhook:inventory_levels/update] SKU/Variant Info: Not found in VariantMap for this shop`);
    }

    try {
      // Fire and forget - DO NOT AWAIT! 
      // Shopify requires a 200 OK within 5 seconds, but our cache delay takes 10 seconds.
      processInventoryUpdate(
        shop,
        inventory_item_id.toString(),
        location_id.toString(),
        available,
        webhookId
      ).catch((err: any) => {
        console.error(`[Webhook:inventory_levels/update] Background sync failed for ${shop}:`, err.message);
      });
      console.log(`[Webhook:inventory_levels/update] Background sync started for ${shop} at ${new Date().toISOString()}`);
    } catch (err: any) {
      console.error(`[Webhook:inventory_levels/update] sync trigger failed for ${shop}:`, err.message);
    }

    return new NextResponse('Webhook processed', { status: 200 });
  } catch (error: any) {
    console.error('[Webhook:inventory_levels/update] error:', error.message);
    if (error.message === 'Webhook signature verification failed.') {
      return new NextResponse('Unauthorized', { status: 401 });
    }
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}