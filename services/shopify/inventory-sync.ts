import { prisma } from '@/lib/db/prisma';
import { createSyncLog } from '@/lib/shopify/sync-log';
import { setInventoryQuantity, adjustInventoryQuantity } from '@/lib/shopify/inventory';
import { syncLock } from '@/lib/shopify/sync-lock';
import { getAdminClient } from '@/lib/shopify/admin';

async function fetchDefaultLocation(shopDomain: string): Promise<string | null> {
  try {
    const client = await getAdminClient(shopDomain);
    const response: any = await client.request(`
      query {
        locations(first: 1) {
          edges {
            node {
              id
            }
          }
        }
      }
    `);
    return response?.data?.locations?.edges?.[0]?.node?.id || null;
  } catch (error) {
    console.log(`[SyncService] Failed to fetch default location for ${shopDomain}: ${error}`);
    return null;
  }
}

export async function processInventoryUpdate(
  shopDomain: string,
  inventoryItemId: string,
  locationId: string,
  availableQuantity: number,
  webhookId?: string
) {
  const tsEntry = new Date().toISOString();
  console.log(`[${tsEntry}] [SyncService] ENTER processInventoryUpdate for ${shopDomain}`);
  try {
    const sourceStore = await prisma.store.findUnique({
      where: { shopDomain },
    });

    if (!sourceStore || !sourceStore.isActive) {
      console.log(`[${new Date().toISOString()}] [SyncService] Source store ${shopDomain} not found or inactive. Skipping.`);
      return;
    }

    const inventoryItemIdStr = String(inventoryItemId);
    const gidInventoryItemId = inventoryItemIdStr.includes('gid://')
      ? inventoryItemIdStr
      : `gid://shopify/InventoryItem/${inventoryItemIdStr}`;

    let sourceVariantMap = null;
    let retries = 0;
    while (!sourceVariantMap && retries < 5) {
      sourceVariantMap = await prisma.variantMap.findFirst({
        where: {
          storeId: sourceStore.id,
          inventoryItemId: gidInventoryItemId,
        },
      });
      
      if (!sourceVariantMap) {
        console.log(`[${new Date().toISOString()}] [SyncService] VariantMap not found for ${gidInventoryItemId}. Retrying in 2 seconds... (${retries + 1}/5)`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        retries++;
      }
    }

    if (!sourceVariantMap) {
      console.log(`[${new Date().toISOString()}] [SyncService] VariantMap lookup failed after retries for inventory item ${gidInventoryItemId} in store ${shopDomain}. Skipping.`);
      return;
    }

    const { sku, shopifyProductId, shopifyVariantId } = sourceVariantMap;
    console.log(`[${new Date().toISOString()}] [SyncService] VariantMap lookup SUCCESS. SKU: ${sku}, Product ID: ${shopifyProductId}, Variant ID: ${shopifyVariantId}`);

    if (!sku) {
      console.log(`[${new Date().toISOString()}] [SyncService] Variant ${shopifyVariantId} has no SKU. Skipping target replication.`);
      return;
    }

    let trueTotalInventory = availableQuantity;
    const sourceCachedProduct = await prisma.productCache.findFirst({
      where: {
        storeId: sourceStore.id,
        shopifyVariantId,
      },
    });

    console.log(`[${new Date().toISOString()}] [SyncService] Delta calculation START for SKU ${sku}`);
    const previousQuantity = sourceCachedProduct ? sourceCachedProduct.inventoryQuantity : trueTotalInventory;
    const delta = trueTotalInventory - previousQuantity;

    console.log(`[${new Date().toISOString()}] [SyncService:Webhook] SKU: ${sku} | Shop: ${shopDomain}`);
    console.log(`[${new Date().toISOString()}] [SyncService:Webhook] [Cached Quantity]: ${previousQuantity}`);
    console.log(`[${new Date().toISOString()}] [SyncService:Webhook] [True Total Quantity]: ${trueTotalInventory}`);
    console.log(`[${new Date().toISOString()}] [SyncService:Webhook] [Calculated Delta]: ${delta}`);

    if (delta !== 0) {
      console.log(`[${new Date().toISOString()}] [SyncService] Updating ProductCache for source store ${shopDomain}`);
      await prisma.productCache.updateMany({
        where: {
          storeId: sourceStore.id,
          shopifyVariantId,
        },
        data: {
          inventoryQuantity: trueTotalInventory,
        },
      });
      console.log(`[${new Date().toISOString()}] [SyncService] ProductCache updated for source store ${shopDomain}`);
    }

    if (!sourceStore.autoSyncEnabled) {
      console.log(`[SyncService] Auto-sync is disabled for source store ${shopDomain}. Skipping target replication.`);
      return;
    }

    if (delta === 0) {
      console.log(`[SyncService] Delta is 0 for SKU ${sku} in store ${shopDomain}. Skipping target replication.`);
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

    console.log(`[${new Date().toISOString()}] [SyncService] Found ${targetVariantMaps.length} target store(s) for SKU ${sku}`);

    if (targetVariantMaps.length === 0) {
      console.log(`[${new Date().toISOString()}] [SyncService] SKU ${sku} is not mapped in any other stores. Finished.`);
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

      let targetLocationQuantity = 0;
      let targetTotalQuantity = 0;
      let effectiveLocationId = target.locationId;
      try {
        if (!effectiveLocationId) {
          effectiveLocationId = await fetchDefaultLocation(target.store.shopDomain);
          if (effectiveLocationId) {
            // Self-heal the VariantMap
            await prisma.variantMap.update({
              where: { id: target.id },
              data: { locationId: effectiveLocationId }
            });
            console.log(`[${new Date().toISOString()}] [SyncService] Self-healed missing locationId for ${target.store.shopDomain}: ${effectiveLocationId}`);
          }
        }

        const client = await getAdminClient(target.store.shopDomain);
        const response: any = await client.request(
          `query getTargetInventoryItemLevels($id: ID!) {
            inventoryItem(id: $id) {
              inventoryLevels(first: 50) {
                edges {
                  node {
                    quantities(names: ["available"]) {
                      quantity
                    }
                    location {
                      id
                    }
                  }
                }
              }
            }
          }`,
          { variables: { id: target.inventoryItemId } }
        );
        
        const targetVariantNode = { inventoryItem: response.data?.inventoryItem };
        if (targetVariantNode) {
          const levels = targetVariantNode.inventoryItem?.inventoryLevels?.edges || [];
          for (const edge of levels) {
            const q = edge.node.quantities[0]?.quantity;
            if (typeof q === 'number') {
              targetTotalQuantity += q;
              if (edge.node.location.id === effectiveLocationId) {
                targetLocationQuantity = q;
              }
            }
          }
        }
      } catch (err: any) {
        console.log(`[${new Date().toISOString()}] [SyncService] Failed to fetch target location quantity: ${err.message}`);
      }

      // In a Hub-and-Spoke model, the Master Store is the absolute source of truth.
      // We should NOT use delta-based syncing, because if a store misses a webhook or gets manually edited, they drift permanently.
      // Instead, we force the Target Store to exactly match the Master Store's absolute inventory quantity.
      const targetNewQuantity = trueTotalInventory;
      const targetNewTotalQuantity = trueTotalInventory;

      console.log(`[${new Date().toISOString()}] [SyncService:Sync] [Target Store Before Update]: ${targetLocationQuantity} (Store: ${target.store.shopDomain})`);
      console.log(`[${new Date().toISOString()}] [SyncService:Sync] [Target Store After Update]: ${targetNewQuantity} (Store: ${target.store.shopDomain})`);

      try {
        if (!effectiveLocationId) {
          throw new Error('Target location ID not mapped for this variant and could not be dynamically fetched.');
        }

        console.log(`[${new Date().toISOString()}] [SyncService] Requesting Shopify inventory set for ${target.store.shopDomain}...`);
        await setInventoryQuantity(
          target.store.shopDomain,
          target.inventoryItemId,
          effectiveLocationId,
          targetNewQuantity
        );
        console.log(`[${new Date().toISOString()}] [SyncService] Shopify inventory update response SUCCESS for ${target.store.shopDomain}`);

        console.log(`[${new Date().toISOString()}] [SyncService] Updating target ProductCache for ${target.store.shopDomain}...`);
        await prisma.productCache.updateMany({
          where: {
            storeId: target.store.id,
            shopifyVariantId: target.shopifyVariantId,
          },
          data: {
            inventoryQuantity: targetNewTotalQuantity,
          },
        });
        console.log(`[${new Date().toISOString()}] [SyncService] Target ProductCache updated for ${target.store.shopDomain}`);

        console.log(`[${new Date().toISOString()}] [SyncService] Delta-synced SKU ${sku} to ${target.store.shopDomain}: ${targetPrevQuantity} -> ${targetNewQuantity} (delta: ${delta})`);
      } catch (error: any) {
        syncStatus = 'FAILED';
        failureReason = error.message || 'Unknown error';
        console.log(`[SyncService] Failed to sync SKU ${sku} to ${target.store.shopDomain}: ${error.message}`);
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
      
      console.log(`[${new Date().toISOString()}] [SyncService] Synchronization COMPLETION for target store ${target.store.shopDomain}`);
    }
    console.log(`[${new Date().toISOString()}] [SyncService] Synchronization COMPLETION for all target stores`);
  } catch (error: any) {
    console.log(`[${new Date().toISOString()}] [SyncService] processInventoryUpdate error: ${error.message}`);
    throw error;
  }
}
