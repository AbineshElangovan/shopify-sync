import { prisma } from '@/lib/db/prisma';
import { createSyncLog } from './sync-log';
import { setInventoryQuantity } from './inventory';

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
      console.log(`Source store ${shopDomain} not found or inactive. Skipping sync.`);
      return;
    }

    // Convert inventoryItemId to standard gid format if it's not already
    const gidInventoryItemId = inventoryItemId.includes('gid://') 
      ? inventoryItemId 
      : `gid://shopify/InventoryItem/${inventoryItemId}`;

    // Find the variant map in the source store
    const sourceVariantMap = await prisma.variantMap.findFirst({
      where: {
        storeId: sourceStore.id,
        inventoryItemId: gidInventoryItemId,
      },
    });

    if (!sourceVariantMap) {
      console.log(`No variant map found for inventory item ${gidInventoryItemId} in store ${shopDomain}. Skipping sync.`);
      return;
    }

    const { sku } = sourceVariantMap;

    // Find all other stores that have this SKU
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
      console.log(`No target stores found for SKU ${sku}. Skipping sync.`);
      return;
    }

    // Sync to all target stores
    for (const target of targetVariantMaps) {
      if (!target.store.isActive) continue;

      let syncStatus: 'SUCCESS' | 'FAILED' = 'SUCCESS';
      let failureReason = '';

      try {
        // If we don't have the target's locationId, we might need to fetch it first.
        // For simplicity, we assume we either have it in VariantMap, or we use a default primary location.
        // We'll require target.locationId to be set during initial sync mapping for reliable updates.
        if (!target.locationId) {
          throw new Error('Target location ID not mapped for this variant.');
        }

        await setInventoryQuantity(
          target.store.shopDomain,
          target.inventoryItemId,
          target.locationId,
          availableQuantity
        );

        console.log(`Successfully synced SKU ${sku} to ${target.store.shopDomain} with quantity ${availableQuantity}`);
      } catch (error: any) {
        syncStatus = 'FAILED';
        failureReason = error.message || 'Unknown error during synchronization';
        console.error(`Failed to sync SKU ${sku} to ${target.store.shopDomain}:`, error);
      }

      // Log the sync attempt
      await createSyncLog({
        sku,
        sourceStoreId: sourceStore.id,
        destinationStoreId: target.store.id,
        previousQuantity: 0, // We might not know the exact previous quantity at destination
        updatedQuantity: availableQuantity,
        status: syncStatus,
        failureReason: failureReason || undefined,
        webhookEventId: webhookId,
      });
    }

  } catch (error) {
    console.error(`Fatal error in processInventoryUpdate for ${shopDomain}:`, error);
    throw error;
  }
}
