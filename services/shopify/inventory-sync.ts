import { prisma } from '@/lib/db/prisma';
import { createSyncLog } from '@/lib/shopify/sync-log';
import { setInventoryQuantity } from '@/lib/shopify/inventory';

export async function processInventoryUpdate(
  shopDomain: string,
  inventoryItemId: string,
  locationId: string,
  availableQuantity: number,
  webhookId?: string
) {
  try {
    const sourceStore = await prisma.store.findUnique({
      where: { shopDomain },
    });

    if (!sourceStore || !sourceStore.isActive) {
      console.log(`[SyncService] Source store ${shopDomain} not found or inactive. Skipping.`);
      return;
    }

    const gidInventoryItemId = inventoryItemId.includes('gid://')
      ? inventoryItemId
      : `gid://shopify/InventoryItem/${inventoryItemId}`;

    const sourceVariantMap = await prisma.variantMap.findFirst({
      where: {
        storeId: sourceStore.id,
        inventoryItemId: gidInventoryItemId,
      },
    });

    if (!sourceVariantMap) {
      console.log(`[SyncService] No variant map found for inventory item ${gidInventoryItemId} in store ${shopDomain}. Skipping.`);
      return;
    }

    const { sku, shopifyProductId, shopifyVariantId } = sourceVariantMap;

    const sourceCachedProduct = await prisma.productCache.findFirst({
      where: {
        storeId: sourceStore.id,
        shopifyVariantId,
      },
    });

    const previousQuantity = sourceCachedProduct ? sourceCachedProduct.inventoryQuantity : availableQuantity;
    const delta = availableQuantity - previousQuantity;

    await prisma.productCache.updateMany({
      where: {
        storeId: sourceStore.id,
        shopifyVariantId,
      },
      data: {
        inventoryQuantity: availableQuantity,
      },
    });

    if (!sourceStore.autoSyncEnabled) {
      console.log(`[SyncService] Auto-sync is disabled for source store ${shopDomain}. Skipping target replication.`);
      return;
    }

    if (delta === 0) {
      console.log(`[SyncService] Delta is 0 for SKU ${sku} in store ${shopDomain}. Skipping target replication.`);
      return;
    }

    if (!sku) {
      console.log(`[SyncService] Variant ${shopifyVariantId} has no SKU. Skipping target replication.`);
      return;
    }

    const targetVariantMaps = await prisma.variantMap.findMany({
      where: {
        sku,
        storeId: { not: sourceStore.id },
      },
      include: {
        store: true,
      },
    });

    if (targetVariantMaps.length === 0) {
      console.log(`[SyncService] SKU ${sku} is not mapped in any other stores. Finished.`);
      return;
    }

    for (const target of targetVariantMaps) {
      if (!target.store.isActive) continue;

      if (!target.store.autoSyncEnabled) {
        console.log(`[SyncService] Auto-sync is disabled for target store ${target.store.shopDomain}. Skipping.`);
        continue;
      }

      let syncStatus: 'SUCCESS' | 'FAILED' = 'SUCCESS';
      let failureReason = '';

      const targetCachedProduct = await prisma.productCache.findFirst({
        where: {
          storeId: target.store.id,
          shopifyVariantId: target.shopifyVariantId,
        },
      });

      const targetPrevQuantity = targetCachedProduct ? targetCachedProduct.inventoryQuantity : 0;
      const targetNewQuantity = Math.max(0, targetPrevQuantity + delta);

      try {
        if (!target.locationId) {
          throw new Error('Target location ID not mapped for this variant.');
        }

        await setInventoryQuantity(
          target.store.shopDomain,
          target.inventoryItemId,
          target.locationId,
          targetNewQuantity
        );

        await prisma.productCache.updateMany({
          where: {
            storeId: target.store.id,
            shopifyVariantId: target.shopifyVariantId,
          },
          data: {
            inventoryQuantity: targetNewQuantity,
          },
        });

        console.log(`[SyncService] Delta-synced SKU ${sku} to ${target.store.shopDomain}: ${targetPrevQuantity} -> ${targetNewQuantity} (delta: ${delta})`);
      } catch (error: any) {
        syncStatus = 'FAILED';
        failureReason = error.message || 'Unknown error';
        console.error(`[SyncService] Failed to sync SKU ${sku} to ${target.store.shopDomain}:`, error.message);
      }

      await createSyncLog({
        sku,
        sourceStoreId: sourceStore.id,
        destinationStoreId: target.store.id,
        previousQuantity: targetPrevQuantity,
        updatedQuantity: targetNewQuantity,
        status: syncStatus,
        failureReason: failureReason || undefined,
        webhookEventId: webhookId,
      });
    }
  } catch (error: any) {
    console.error(`[SyncService] processInventoryUpdate error:`, error.message);
    throw error;
  }
}
