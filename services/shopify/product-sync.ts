import { prisma } from '@/lib/db/prisma';
import { getAdminClient } from '@/lib/shopify/admin';
import { createSyncLog } from '@/lib/shopify/sync-log';
import { PRODUCT_SET_MUTATION, PRODUCT_DELETE_MUTATION, LOCATIONS_QUERY } from './graphql-queries';

const globalShared: any = global;
globalShared.syncLocks = globalShared.syncLocks || new Set<string>();

export function acquireSyncLock(shop: string, id: string, identifier: string): boolean {
  const normalizedShop = shop.replace(/^https?:\/\//, '').trim();
  const cleanId = id.replace('gid://shopify/Product/', '').trim();
  const key = `${normalizedShop}:${cleanId}:${identifier}`;
  
  if (globalShared.syncLocks.has(key)) {
    return false; 
  }
  globalShared.syncLocks.add(key);
  console.log(`[SyncLock] Acquired lock for key: ${key}`);
  
  setTimeout(() => {
    if (globalShared.syncLocks.has(key)) {
      globalShared.syncLocks.delete(key);
      console.log(`[SyncLock] Auto-released expired lock for key: ${key}`);
    }
  }, 45000);
  return true;
}

export function hasSyncLock(shop: string, id: string, identifier: string): boolean {
  const normalizedShop = shop.replace(/^https?:\/\//, '').trim();
  const cleanId = id.replace('gid://shopify/Product/', '').trim();
  const key = `${normalizedShop}:${cleanId}:${identifier}`;
  return globalShared.syncLocks.has(key);
}

export function releaseSyncLock(shop: string, id: string, identifier: string) {
  const normalizedShop = shop.replace(/^https?:\/\//, '').trim();
  const cleanId = id.replace('gid://shopify/Product/', '').trim();
  const key = `${normalizedShop}:${cleanId}:${identifier}`;
  if (globalShared.syncLocks.has(key)) {
    globalShared.syncLocks.delete(key);
    console.log(`[SyncLock] Explicitly released lock for key: ${key}`);
  }
}

async function fetchDefaultLocation(shopDomain: string): Promise<string | null> {
  try {
    const client = await getAdminClient(shopDomain);
    const response: any = await client.request(LOCATIONS_QUERY);
    return response?.data?.locations?.edges?.[0]?.node?.id || null;
  } catch (error) {
    console.error(`[ProductSync] Failed to fetch location for ${shopDomain}:`, error);
    return null;
  }
}

async function updateExistingProduct(shopDomain: string, shopifyProductId: string, payload: any) {
  const client = await getAdminClient(shopDomain);
  const productInput: any = {
    id: shopifyProductId,
    title: payload.title,
    descriptionHtml: payload.body_html || "",
    vendor: payload.vendor || "",
    productType: payload.product_type || "",
    status: payload.status ? payload.status.toUpperCase() : "ACTIVE",
  };
  const response: any = await client.request(PRODUCT_SET_MUTATION, { variables: { input: productInput } });
  const userErrors = response?.data?.productSet?.userErrors || [];
  if (userErrors.length > 0) {
    throw new Error(userErrors.map((e: any) => `${e.field}: ${e.message}`).join(', '));
  }
}

export async function processProductCreate(shopDomain: string, payload: any, webhookId?: string) {
  try {
    const sourceStore = await prisma.store.findUnique({
      where: { shopDomain },
    });

    if (!sourceStore || !sourceStore.isActive) {
      console.log(`[ProductSync:Create] Source store ${shopDomain} not found or inactive. Skipping.`);
      return;
    }

    const variantsWithSkus = payload.variants?.filter((v: any) => v.sku?.trim()) || [];
    if (variantsWithSkus.length === 0) {
      console.log(`[ProductSync:Create] Product ${payload.id} has no variants with SKUs. Ignoring.`);
      return;
    }

    const targetStores = await prisma.store.findMany({
      where: { shopDomain: { not: shopDomain }, isActive: true },
    });

    for (const targetStore of targetStores) {
      if (!targetStore.autoSyncEnabled) continue;

      const skus = variantsWithSkus.map((v: any) => v.sku.trim());
      
      const existingMapping = await prisma.variantMap.findFirst({
        where: {
          storeId: targetStore.id,
          sku: { in: skus },
        },
      });

      if (existingMapping) {
        console.log(`[ProductSync:Create] Product with SKUs ${skus.join(', ')} already exists in target store ${targetStore.shopDomain}. Updating instead of creating.`);
        
        acquireSyncLock(targetStore.shopDomain, existingMapping.shopifyProductId, payload.title);
        
        let syncStatus: 'SUCCESS' | 'FAILED' = 'SUCCESS';
        let failureReason = '';
        
        try {
          await updateExistingProduct(targetStore.shopDomain, existingMapping.shopifyProductId, payload);
          
          await prisma.productCache.updateMany({
            where: {
              storeId: targetStore.id,
              shopifyProductId: existingMapping.shopifyProductId,
            },
            data: {
              title: payload.title,
            },
          });
        } catch (err: any) {
          syncStatus = 'FAILED';
          failureReason = err.message || 'Update failed during create fallback';
          console.error(`[ProductSync:Create] Fallback update failed for ${targetStore.shopDomain}:`, failureReason);
        }

        await createSyncLog({
          sku: skus[0] || "UNKNOWN",
          sourceStoreId: sourceStore.id,
          destinationStoreId: targetStore.id,
          previousQuantity: 0,
          updatedQuantity: 0,
          status: syncStatus,
          failureReason: failureReason ? `PRODUCT_UPDATE_FALLBACK_FAILED: ${failureReason}` : `PRODUCT_UPDATED_FALLBACK`,
          webhookEventId: webhookId,
        });
        continue;
      }

      const targetLocationId = await fetchDefaultLocation(targetStore.shopDomain);
      if (!targetLocationId) {
        console.error(`[ProductSync:Create] Could not resolve default location for ${targetStore.shopDomain}. Skipping.`);
        continue;
      }

      const client = await getAdminClient(targetStore.shopDomain);

      const productInput: any = {
        title: payload.title,
        descriptionHtml: payload.body_html || "",
        vendor: payload.vendor || "",
        productType: payload.product_type || "",
        status: payload.status ? payload.status.toUpperCase() : "ACTIVE",
      };

      if (payload.options && payload.options.length > 0) {
        productInput.productOptions = payload.options.map((opt: any) => ({
          name: opt.name,
          values: opt.values ? opt.values.map((v: string) => ({ name: v })) : []
        }));
      }

      if (payload.variants && payload.variants.length > 0) {
        productInput.variants = payload.variants.map((v: any) => {
          const variantInput: any = {
            price: v.price,
            sku: v.sku?.trim() || "",
          };
          const options: string[] = [];
          if (v.option1) options.push(v.option1);
          if (v.option2) options.push(v.option2);
          if (v.option3) options.push(v.option3);

          if (options.length > 0) {
            variantInput.optionValues = options.map((val, idx) => ({
              optionName: payload.options[idx]?.name || `Option ${idx + 1}`,
              name: val
            }));
          }
          return variantInput;
        });
      }

      let syncStatus: 'SUCCESS' | 'FAILED' = 'SUCCESS';
      let failureReason = '';

      try {
        const response: any = await client.request(PRODUCT_SET_MUTATION, { variables: { input: productInput } });
        const userErrors = response?.data?.productSet?.userErrors || [];
        
        if (userErrors.length > 0) {
          throw new Error(userErrors.map((e: any) => `${e.field}: ${e.message}`).join(', '));
        }

        const createdProduct = response?.data?.productSet?.product;
        const createdVariants = createdProduct?.variants?.edges || [];

        acquireSyncLock(targetStore.shopDomain, createdProduct.id, payload.title);

        for (const variantEdge of createdVariants) {
          const variant = variantEdge.node;
          const sku = variant.sku?.trim() || "";
          if (!sku) continue;

          await prisma.productCache.upsert({
            where: {
              storeId_shopifyVariantId: {
                storeId: targetStore.id,
                shopifyVariantId: variant.id,
              },
            },
            update: {
              sku,
              title: `${createdProduct.title}${variant.title && variant.title !== 'Default Title' ? ` - ${variant.title}` : ''}`,
              shopifyProductId: createdProduct.id,
            },
            create: {
              storeId: targetStore.id,
              shopifyProductId: createdProduct.id,
              shopifyVariantId: variant.id,
              sku,
              title: `${createdProduct.title}${variant.title && variant.title !== 'Default Title' ? ` - ${variant.title}` : ''}`,
              inventoryQuantity: 0,
            },
          });

          await prisma.variantMap.upsert({
            where: {
              storeId_shopifyVariantId: {
                storeId: targetStore.id,
                shopifyVariantId: variant.id,
              },
            },
            update: {
              sku,
              shopifyProductId: createdProduct.id,
              inventoryItemId: variant.inventoryItem?.id || "",
              locationId: targetLocationId,
            },
            create: {
              storeId: targetStore.id,
              sku,
              shopifyProductId: createdProduct.id,
              shopifyVariantId: variant.id,
              inventoryItemId: variant.inventoryItem?.id || "",
              locationId: targetLocationId,
            },
          });
        }

        console.log(`[ProductSync:Create] Successfully created product ${payload.title} in target store ${targetStore.shopDomain}`);
      } catch (err: any) {
        syncStatus = 'FAILED';
        failureReason = err.message || 'Unknown error during creation';
        console.error(`[ProductSync:Create] Failed to create product in ${targetStore.shopDomain}:`, failureReason);
      }

      await createSyncLog({
        sku: skus[0] || "UNKNOWN",
        sourceStoreId: sourceStore.id,
        destinationStoreId: targetStore.id,
        previousQuantity: 0,
        updatedQuantity: 0,
        status: syncStatus,
        failureReason: failureReason ? `PRODUCT_CREATE_FAILED: ${failureReason}` : `PRODUCT_CREATED`,
        webhookEventId: webhookId,
      });
    }

  } catch (error: any) {
    console.error(`[ProductSync:Create] Fatal error:`, error.message);
  }
}

export async function processProductUpdate(shopDomain: string, payload: any, webhookId?: string) {
  try {
    const sourceStore = await prisma.store.findUnique({
      where: { shopDomain },
    });

    if (!sourceStore || !sourceStore.isActive) {
      console.log(`[ProductSync:Update] Source store ${shopDomain} not found or inactive. Skipping.`);
      return;
    }

    const variantsWithSkus = payload.variants?.filter((v: any) => v.sku?.trim()) || [];
    if (variantsWithSkus.length === 0) {
      console.log(`[ProductSync:Update] Product ${payload.id} has no variants with SKUs. Skipping replication.`);
      return;
    }

    const targetStores = await prisma.store.findMany({
      where: { shopDomain: { not: shopDomain }, isActive: true },
    });

    for (const targetStore of targetStores) {
      if (!targetStore.autoSyncEnabled) continue;

      const skus = variantsWithSkus.map((v: any) => v.sku.trim());
      const matchingVariantMap = await prisma.variantMap.findFirst({
        where: {
          storeId: targetStore.id,
          sku: { in: skus },
        },
      });

      if (!matchingVariantMap) {
        console.log(`[ProductSync:Update] No matching product found in target store ${targetStore.shopDomain} for SKUs ${skus.join(', ')}. Skipping update.`);
        continue;
      }

      const targetCachedProduct = await prisma.productCache.findFirst({
        where: {
          storeId: targetStore.id,
          shopifyProductId: matchingVariantMap.shopifyProductId,
        },
      });

      if (targetCachedProduct && targetCachedProduct.title === `${payload.title}${payload.variants[0]?.title && payload.variants[0].title !== 'Default Title' ? ` - ${payload.variants[0].title}` : ''}`) {
        console.log(`[ProductSync:Update] Target store ${targetStore.shopDomain} already matches payload title. Skipping update to prevent sync loop.`);
        continue;
      }

      const client = await getAdminClient(targetStore.shopDomain);

      const productInput: any = {
        id: matchingVariantMap.shopifyProductId,
        title: payload.title,
        descriptionHtml: payload.body_html || "",
        vendor: payload.vendor || "",
        productType: payload.product_type || "",
        status: payload.status ? payload.status.toUpperCase() : "ACTIVE",
      };

      acquireSyncLock(targetStore.shopDomain, matchingVariantMap.shopifyProductId, payload.title);

      let syncStatus: 'SUCCESS' | 'FAILED' = 'SUCCESS';
      let failureReason = '';

      try {
        const response: any = await client.request(PRODUCT_SET_MUTATION, { variables: { input: productInput } });
        const userErrors = response?.data?.productSet?.userErrors || [];

        if (userErrors.length > 0) {
          throw new Error(userErrors.map((e: any) => `${e.field}: ${e.message}`).join(', '));
        }

        await prisma.productCache.updateMany({
          where: {
            storeId: targetStore.id,
            shopifyProductId: matchingVariantMap.shopifyProductId,
          },
          data: {
            title: payload.title,
          },
        });

        console.log(`[ProductSync:Update] Successfully updated product ${payload.title} in target store ${targetStore.shopDomain}`);
      } catch (err: any) {
        syncStatus = 'FAILED';
        failureReason = err.message || 'Unknown error during update';
        console.error(`[ProductSync:Update] Failed to update product in ${targetStore.shopDomain}:`, failureReason);
        
        releaseSyncLock(targetStore.shopDomain, matchingVariantMap.shopifyProductId, payload.title);
      }

      await createSyncLog({
        sku: skus[0] || "UNKNOWN",
        sourceStoreId: sourceStore.id,
        destinationStoreId: targetStore.id,
        previousQuantity: 0,
        updatedQuantity: 0,
        status: syncStatus,
        failureReason: failureReason ? `PRODUCT_UPDATE_FAILED: ${failureReason}` : `PRODUCT_UPDATED`,
        webhookEventId: webhookId,
      });
    }

  } catch (error: any) {
    console.error(`[ProductSync:Update] Fatal error:`, error.message);
  }
}

export async function processProductDelete(shopDomain: string, payload: any, webhookId?: string) {
  try {
    const sourceStore = await prisma.store.findUnique({
      where: { shopDomain },
    });

    if (!sourceStore || !sourceStore.isActive) {
      console.log(`[ProductSync:Delete] Source store ${shopDomain} not found or inactive. Skipping.`);
      return;
    }

    const sourceVariantMaps = await prisma.variantMap.findMany({
      where: {
        storeId: sourceStore.id,
        shopifyProductId: `gid://shopify/Product/${payload.id}`,
      },
    });

    if (sourceVariantMaps.length === 0) {
      console.log(`[ProductSync:Delete] No variant mapping found for product ID ${payload.id}. Skipping deletion.`);
      return;
    }

    const skus = sourceVariantMaps.map((v) => v.sku).filter(Boolean);

    const targetStores = await prisma.store.findMany({
      where: { shopDomain: { not: shopDomain }, isActive: true },
    });

    for (const targetStore of targetStores) {
      if (!targetStore.autoSyncEnabled) continue;

      let matchingVariantMap = await prisma.variantMap.findFirst({
        where: {
          storeId: targetStore.id,
          shopifyProductId: { in: sourceVariantMaps.map((m) => m.shopifyProductId).filter(Boolean) }
        }
      });

      if (!matchingVariantMap && skus.length > 0) {
        matchingVariantMap = await prisma.variantMap.findFirst({
          where: {
            storeId: targetStore.id,
            sku: { in: skus },
          },
        });
      }

      if (!matchingVariantMap) {
        console.log(`[ProductSync:Delete] No matching product found in target store ${targetStore.shopDomain} for delete.`);
        continue;
      }

      const client = await getAdminClient(targetStore.shopDomain);

      let syncStatus: 'SUCCESS' | 'FAILED' = 'SUCCESS';
      let failureReason = '';

      try {
        const response: any = await client.request(PRODUCT_DELETE_MUTATION, {
          variables: {
            input: { id: matchingVariantMap.shopifyProductId }
          }
        });
        const userErrors = response?.data?.productDelete?.userErrors || [];

        if (userErrors.length > 0) {
          throw new Error(userErrors.map((e: any) => `${e.field}: ${e.message}`).join(', '));
        }

        await prisma.variantMap.deleteMany({
          where: {
            storeId: targetStore.id,
            shopifyProductId: matchingVariantMap.shopifyProductId,
          },
        });

        await prisma.productCache.deleteMany({
          where: {
            storeId: targetStore.id,
            shopifyProductId: matchingVariantMap.shopifyProductId,
          },
        });

        console.log(`[ProductSync:Delete] Successfully deleted matching product in target store ${targetStore.shopDomain}`);
      } catch (err: any) {
        syncStatus = 'FAILED';
        failureReason = err.message || 'Unknown error during deletion';
        console.error(`[ProductSync:Delete] Failed to delete product in ${targetStore.shopDomain}:`, failureReason);
      }

      await createSyncLog({
        sku: skus[0] || "UNKNOWN",
        sourceStoreId: sourceStore.id,
        destinationStoreId: targetStore.id,
        previousQuantity: 0,
        updatedQuantity: 0,
        status: syncStatus,
        failureReason: failureReason ? `PRODUCT_DELETE_FAILED: ${failureReason}` : `PRODUCT_DELETED`,
        webhookEventId: webhookId,
      });
    }

    await prisma.variantMap.deleteMany({
      where: {
        storeId: sourceStore.id,
        shopifyProductId: `gid://shopify/Product/${payload.id}`,
      },
    });

    await prisma.productCache.deleteMany({
      where: {
        storeId: sourceStore.id,
        shopifyProductId: `gid://shopify/Product/${payload.id}`,
      },
    });

  } catch (error: any) {
    console.error(`[ProductSync:Delete] Fatal error:`, error.message);
  }
}
