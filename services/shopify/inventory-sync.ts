import { prisma } from '@/lib/db/prisma';
import { createSyncLog } from '@/lib/shopify/sync-log';
import { setInventoryQuantity, adjustInventoryQuantity } from '@/lib/shopify/inventory';
import { syncLock } from '@/lib/shopify/sync-lock';
import { getAdminClient } from '@/lib/shopify/admin';
import fs from 'fs';

function logDebug(msg: string) {
  try {
    fs.appendFileSync('c:/Users/eabin/OneDrive/Desktop/next task/shopify-sync/webhook_debug.txt', msg + '\n');
  } catch(e){}
  console.log(msg);
}

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
    logDebug(`[SyncService] Failed to fetch default location for ${shopDomain}: ${error}`);
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
  logDebug(`[${tsEntry}] [SyncService] ENTER processInventoryUpdate for ${shopDomain}`);
  try {
    const sourceStore = await prisma.store.findUnique({
      where: { shopDomain },
    });

    if (!sourceStore || !sourceStore.isActive) {
      logDebug(`[${new Date().toISOString()}] [SyncService] Source store ${shopDomain} not found or inactive. Skipping.`);
      return;
    }

    const inventoryItemIdStr = String(inventoryItemId);
    const gidInventoryItemId = inventoryItemIdStr.includes('gid://')
      ? inventoryItemIdStr
      : `gid://shopify/InventoryItem/${inventoryItemIdStr}`;

    const sourceVariantMap = await prisma.variantMap.findFirst({
      where: {
        storeId: sourceStore.id,
        inventoryItemId: gidInventoryItemId,
      },
    });

    if (!sourceVariantMap) {
      logDebug(`[${new Date().toISOString()}] [SyncService] VariantMap lookup: No variant map found for inventory item ${gidInventoryItemId} in store ${shopDomain}. Skipping.`);
      return;
    }

    const { sku, shopifyProductId, shopifyVariantId } = sourceVariantMap;
    logDebug(`[${new Date().toISOString()}] [SyncService] VariantMap lookup SUCCESS. SKU: ${sku}, Product ID: ${shopifyProductId}, Variant ID: ${shopifyVariantId}`);

    if (!sku) {
      logDebug(`[${new Date().toISOString()}] [SyncService] Variant ${shopifyVariantId} has no SKU. Skipping target replication.`);
      return;
    }

    let trueTotalInventory = availableQuantity;
    try {
      logDebug(`[${new Date().toISOString()}] [SyncService] Waiting 10000ms for Shopify cache to invalidate...`);
      await new Promise((resolve) => setTimeout(resolve, 10000));
      
      const adminClient = await getAdminClient(shopDomain);
      const query = `
        query getInventoryItemLevels($id: ID!) {
          inventoryItem(id: $id) {
            inventoryLevels(first: 50) {
              edges {
                node {
                  quantities(names: ["available"]) {
                    quantity
                  }
                }
              }
            }
          }
        }
      `;
      const response: any = await adminClient.request(query, { variables: { id: gidInventoryItemId } });
      const levels = response.data?.inventoryItem?.inventoryLevels?.edges || [];
      
      let sum = 0;
      let foundLevels = false;
      for (const edge of levels) {
        const q = edge.node.quantities?.[0]?.quantity;
        if (typeof q === 'number') {
          sum += q;
          foundLevels = true;
        }
      }
      
      if (foundLevels) {
        trueTotalInventory = sum;
      }
    } catch (err: any) {
      logDebug(`[${new Date().toISOString()}] [SyncService] Failed to fetch true inventory for ${sku}: ${err.message}`);
    }

    const sourceCachedProduct = await prisma.productCache.findFirst({
      where: {
        storeId: sourceStore.id,
        shopifyVariantId,
      },
    });

    logDebug(`[${new Date().toISOString()}] [SyncService] Delta calculation START for SKU ${sku}`);
    const previousQuantity = sourceCachedProduct ? sourceCachedProduct.inventoryQuantity : trueTotalInventory;
    const delta = trueTotalInventory - previousQuantity;

    logDebug(`[${new Date().toISOString()}] [SyncService:Webhook] SKU: ${sku} | Shop: ${shopDomain}`);
    logDebug(`[${new Date().toISOString()}] [SyncService:Webhook] [Cached Quantity]: ${previousQuantity}`);
    logDebug(`[${new Date().toISOString()}] [SyncService:Webhook] [True Total Quantity]: ${trueTotalInventory}`);
    logDebug(`[${new Date().toISOString()}] [SyncService:Webhook] [Calculated Delta]: ${delta}`);

    if (delta !== 0) {
      logDebug(`[${new Date().toISOString()}] [SyncService] Updating ProductCache for source store ${shopDomain}`);
      await prisma.productCache.updateMany({
        where: {
          storeId: sourceStore.id,
          shopifyVariantId,
        },
        data: {
          inventoryQuantity: trueTotalInventory,
        },
      });
      logDebug(`[${new Date().toISOString()}] [SyncService] ProductCache updated for source store ${shopDomain}`);
    }

    if (!sourceStore.autoSyncEnabled) {
      logDebug(`[SyncService] Auto-sync is disabled for source store ${shopDomain}. Skipping target replication.`);
      return;
    }

    if (delta === 0) {
      logDebug(`[SyncService] Delta is 0 for SKU ${sku} in store ${shopDomain}. Skipping target replication.`);
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

    logDebug(`[${new Date().toISOString()}] [SyncService] Found ${targetVariantMaps.length} target store(s) for SKU ${sku}`);

    if (targetVariantMaps.length === 0) {
      logDebug(`[${new Date().toISOString()}] [SyncService] SKU ${sku} is not mapped in any other stores. Finished.`);
      return;
    }

    for (const target of targetVariantMaps) {
      if (!target.store.isActive) continue;

      if (!target.store.autoSyncEnabled) {
        logDebug(`[SyncService] Auto-sync is disabled for target store ${target.store.shopDomain}. Skipping.`);
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
            logDebug(`[${new Date().toISOString()}] [SyncService] Self-healed missing locationId for ${target.store.shopDomain}: ${effectiveLocationId}`);
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
        logDebug(`[${new Date().toISOString()}] [SyncService] Failed to fetch target location quantity: ${err.message}`);
      }

      const targetNewQuantity = Math.max(0, targetLocationQuantity + delta);
      const targetNewTotalQuantity = Math.max(0, targetTotalQuantity + delta);

      logDebug(`[${new Date().toISOString()}] [SyncService:Sync] [Target Store Before Update]: ${targetLocationQuantity} (Store: ${target.store.shopDomain})`);
      logDebug(`[${new Date().toISOString()}] [SyncService:Sync] [Target Store After Update]: ${targetNewQuantity} (Store: ${target.store.shopDomain})`);

      try {
        if (!effectiveLocationId) {
          throw new Error('Target location ID not mapped for this variant and could not be dynamically fetched.');
        }

        logDebug(`[${new Date().toISOString()}] [SyncService] Requesting Shopify inventory set for ${target.store.shopDomain}...`);
        await setInventoryQuantity(
          target.store.shopDomain,
          target.inventoryItemId,
          effectiveLocationId,
          targetNewQuantity
        );
        logDebug(`[${new Date().toISOString()}] [SyncService] Shopify inventory update response SUCCESS for ${target.store.shopDomain}`);

        logDebug(`[${new Date().toISOString()}] [SyncService] Updating target ProductCache for ${target.store.shopDomain}...`);
        await prisma.productCache.updateMany({
          where: {
            storeId: target.store.id,
            shopifyVariantId: target.shopifyVariantId,
          },
          data: {
            inventoryQuantity: targetNewTotalQuantity,
          },
        });
        logDebug(`[${new Date().toISOString()}] [SyncService] Target ProductCache updated for ${target.store.shopDomain}`);

        logDebug(`[${new Date().toISOString()}] [SyncService] Delta-synced SKU ${sku} to ${target.store.shopDomain}: ${targetPrevQuantity} -> ${targetNewQuantity} (delta: ${delta})`);
      } catch (error: any) {
        syncStatus = 'FAILED';
        failureReason = error.message || 'Unknown error';
        logDebug(`[SyncService] Failed to sync SKU ${sku} to ${target.store.shopDomain}: ${error.message}`);
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
      
      logDebug(`[${new Date().toISOString()}] [SyncService] Synchronization COMPLETION for target store ${target.store.shopDomain}`);
    }
    logDebug(`[${new Date().toISOString()}] [SyncService] Synchronization COMPLETION for all target stores`);
  } catch (error: any) {
    logDebug(`[${new Date().toISOString()}] [SyncService] processInventoryUpdate error: ${error.message}`);
    throw error;
  }
}
