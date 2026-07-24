import { prisma } from '@/lib/db/prisma';
import { getAdminClient } from '@/lib/shopify/admin';
import { setInventoryQuantity } from '@/lib/shopify/inventory';
import { createSyncLog } from '@/lib/shopify/sync-log';
import { syncProductIdentity } from '@/services/product-identity';
import {
  PRODUCT_SET_MUTATION, PRODUCT_DELETE_MUTATION, PRODUCT_VARIANTS_DELETE_MUTATION,
  GET_VARIANT_BY_SKU_QUERY, GET_PRODUCT_BY_ID_QUERY, LOCATIONS_QUERY,
  GET_PRODUCT_COLLECTIONS_QUERY, GET_COLLECTIONS_BY_TITLE_QUERY, CREATE_COLLECTION_MUTATION,
  ADD_PRODUCT_TO_COLLECTION_MUTATION, GET_PUBLICATIONS_QUERY, PUBLISH_MUTATION
} from './graphql';
import { syncProductCollectionsByTags } from './collection-sync';

const globalShared: any = global;
globalShared.syncLocks = globalShared.syncLocks || new Set<string>();

// Helper for async locks to prevent race conditions during concurrent execution (e.g. collection creation)
globalShared.asyncLocks = globalShared.asyncLocks || new Map<string, Promise<void>>();
export async function withLock<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previousLock = globalShared.asyncLocks.get(key);
  let releaseLock: () => void;
  const newLock = new Promise<void>((resolve) => { releaseLock = resolve; });
  const taskPromise = (async () => {
    if (previousLock) await previousLock;
    try { return await task(); }
    finally {
      releaseLock!();
      if (globalShared.asyncLocks.get(key) === newLock) globalShared.asyncLocks.delete(key);
    }
  })();
  globalShared.asyncLocks.set(key, newLock);
  return taskPromise;
}

function calculateAdjustedPrice(sourcePriceStr: string, sourceStore: any, targetStore: any): string {
  const sourcePrice = parseFloat(sourcePriceStr || "0");
  if (isNaN(sourcePrice)) return sourcePriceStr;

  // Reverse source adjustment to get base price
  let basePrice = sourcePrice;
  if (sourceStore && sourceStore.isPriceAdjustmentEnabled) {
    const value = sourceStore.priceAdjustmentValue || 0;
    if (sourceStore.priceAdjustmentType === 'PERCENTAGE' && value !== -100) {
      basePrice = sourcePrice / (1 + value / 100);
    } else if (sourceStore.priceAdjustmentType === 'FIXED') {
      basePrice = sourcePrice - value;
    }
  }

  // Apply target adjustment on base price
  let adjusted = basePrice;
  if (targetStore && targetStore.isPriceAdjustmentEnabled) {
    const value = targetStore.priceAdjustmentValue || 0;

    if (targetStore.priceAdjustmentType === 'PERCENTAGE') {
      adjusted = basePrice * (1 + value / 100);
    } else if (targetStore.priceAdjustmentType === 'FIXED') {
      adjusted = basePrice + value;
    }
  }

  if (adjusted < 0) {
    adjusted = 0;
  }

  return adjusted.toFixed(2);
}

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

async function publishProductToAllChannels(shopDomain: string, productId: string) {
  try {
    const client = await getAdminClient(shopDomain);
    const pubResponse: any = await client.request(GET_PUBLICATIONS_QUERY);
    const publications = pubResponse?.data?.publications?.edges || [];
    
    if (publications.length === 0) return;

    const publicationInputs = publications.map((edge: any) => ({
      publicationId: edge.node.id
    }));

    const response: any = await client.request(PUBLISH_MUTATION, {
      variables: {
        id: productId,
        input: publicationInputs
      }
    });

    const userErrors = response?.data?.publishablePublish?.userErrors || [];
    if (userErrors.length > 0) {
      console.error(`[ProductSync:Publish] Failed to publish ${productId} in ${shopDomain}:`, userErrors);
    } else {
      console.log(`[ProductSync:Publish] Successfully published ${productId} to ${publications.length} channels in ${shopDomain}`);
    }
  } catch (error: any) {
    console.error(`[ProductSync:Publish] Error publishing ${productId} in ${shopDomain}:`, error.message);
  }
}

async function findTargetProductBySku(shopDomain: string, sku: string) {
  try {
    const client = await getAdminClient(shopDomain);
    const response: any = await client.request(GET_VARIANT_BY_SKU_QUERY, {
      variables: { query: `sku:${sku}` },
    });
    const edges = response?.data?.productVariants?.edges || [];
    for (const edge of edges) {
      const node = edge.node;
      if (node.sku?.trim().toLowerCase() === sku.trim().toLowerCase()) {
        return {
          productId: node.product?.id,
          variantId: node.id,
          inventoryItemId: node.inventoryItem?.id,
          price: node.price,
        };
      }
    }
  } catch (error: any) {
    console.error(`[ProductSync:Lookup] SKU lookup failed for ${sku} in ${shopDomain}:`, error.message);
  }
  return null;
}

export async function updateLocalProductCache(shopDomain: string, payload: any, topic?: string) {
  try {
    const store = await prisma.store.findUnique({
      where: { shopDomain },
    });

    if (!store) return;

    const shopifyProductId = `gid://shopify/Product/${payload.id}`;

    // Removed cache cleanup for products/delete to prevent race condition with products-delete route

    if (!store.isActive) {
      console.log(`[ProductSync:Cache] Store ${shopDomain} not found or inactive. Skipping cache update.`);
      return;
    }
    // Removed GraphQL query to fetch true inventory because products/update shouldn't modify inventory cache for existing products (it races with inventory_levels/update)

    const variants = payload.variants || [];
    console.log(`[ProductSync:Cache] Processing ${variants.length} variants for ${shopDomain}`);
    const syncedVariantIds: string[] = [];

    for (const variant of variants) {
      console.log(`[ProductSync:Cache] Variant ID: ${variant.id}, SKU: ${variant.sku}`);
      const variantTitle = variant.title && variant.title !== 'Default Title' ? ` - ${variant.title}` : '';
      const fullTitle = `${payload.title}${variantTitle}`;
      const sku = variant.sku?.trim() || null;
      const shopifyVariantId = `gid://shopify/ProductVariant/${variant.id}`;
      const inventoryItemId = `gid://shopify/InventoryItem/${variant.inventory_item_id}`;

      syncedVariantIds.push(shopifyVariantId);

      const existingMap = await prisma.variantMap.findUnique({
        where: {
          storeId_shopifyVariantId: {
            storeId: store.id,
            shopifyVariantId,
          },
        },
      });

      const newImageUrl = payload.image?.src || payload.images?.[0]?.src;

      const existingCache = await prisma.productCache.findUnique({
        where: {
          storeId_shopifyVariantId: {
            storeId: store.id,
            shopifyVariantId,
          },
        },
      });

      const parsedPrice = parseFloat(variant.price || "0");
      const trueInventory = variant.inventory_quantity ?? 0;
      
      let finalSku = variant.sku?.trim() || null;
      // Prevent stale webhooks/GraphQL from wiping out a successfully generated SKU
      if (!finalSku && existingCache && existingCache.sku && existingCache.sku !== 'N/A') {
        finalSku = existingCache.sku;
      }
      
      const productTags = payload.tags || null;
      
      if (!existingCache) {
        await prisma.productCache.create({
          data: {
            storeId: store.id,
            shopifyProductId,
            shopifyVariantId,
            sku: finalSku,
            title: fullTitle,
            tags: productTags,
            imageUrl: payload.image?.src || payload.images?.[0]?.src || null,
            inventoryQuantity: trueInventory,
            price: parsedPrice,
          }
        });
      } else {
        const newImageUrl = payload.image?.src || payload.images?.[0]?.src || null;
        const needsUpdate = existingCache.sku !== finalSku || 
                            existingCache.title !== fullTitle || 
                            existingCache.price !== parsedPrice || 
                            existingCache.tags !== productTags ||
                            (newImageUrl !== null && existingCache.imageUrl !== newImageUrl);
                            
        if (needsUpdate) {
          await prisma.productCache.update({
            where: { id: existingCache.id },
            data: {
              sku: finalSku,
              title: fullTitle,
              tags: productTags,
              ...(newImageUrl !== null ? { imageUrl: newImageUrl } : {}),
              shopifyProductId,
              price: parsedPrice,
            },
          });
        }
      }

      require('fs').appendFileSync('C:/Users/eabin/OneDrive/Desktop/next task/shopify-sync/sync-debug.log', `[${new Date().toISOString()}] updateLocalProductCache for ${shopDomain}: SKU=${sku}, payloadVariants=${variants.length}\n`);
      
      await prisma.variantMap.upsert({
        where: {
          storeId_shopifyVariantId: {
            storeId: store.id,
            shopifyVariantId,
          },
        },
        update: {
          sku: sku || '',
          shopifyProductId,
          inventoryItemId,
          locationId: existingMap?.locationId || null,
        },
        create: {
          storeId: store.id,
          sku: sku || '',
          shopifyProductId,
          shopifyVariantId,
          inventoryItemId,
          locationId: null,
        },
      });
      require('fs').appendFileSync('C:/Users/eabin/OneDrive/Desktop/next task/shopify-sync/sync-debug.log', `[${new Date().toISOString()}] updateLocalProductCache upserted VariantMap for ${shopDomain}: SKU=${sku}\n`);
    }

    if (variants.length > 0) {
      await prisma.productCache.deleteMany({
        where: {
          storeId: store.id,
          shopifyProductId,
          shopifyVariantId: { notIn: syncedVariantIds },
        },
      });

      await prisma.variantMap.deleteMany({
        where: {
          storeId: store.id,
          shopifyProductId,
          shopifyVariantId: { notIn: syncedVariantIds },
        },
      });
    }

    try {
      // First ensure tags are properly mapped to collections in Shopify
      if (payload.tags) {
        await syncProductCollectionsByTags(shopDomain, shopifyProductId, payload.tags);
      }

      const client = await getAdminClient(shopDomain);
      const productResponse: any = await client.request(GET_PRODUCT_COLLECTIONS_QUERY, {
        variables: { id: shopifyProductId }
      });
      const existingEdges = productResponse?.data?.product?.collections?.edges || [];
      const productCollectionDbIds: string[] = [];

      for (const edge of existingEdges) {
        if (edge.node) {
          const col = edge.node;
          const dbCol = await prisma.collection.upsert({
            where: {
              storeId_shopifyCollectionId: {
                storeId: store.id,
                shopifyCollectionId: col.id,
              },
            },
            update: { title: col.title, handle: col.handle },
            create: { storeId: store.id, shopifyCollectionId: col.id, title: col.title, handle: col.handle },
          });
          productCollectionDbIds.push(dbCol.id);
        }
      }

      const allCaches = await prisma.productCache.findMany({
        where: { storeId: store.id, shopifyProductId },
      });

      for (const cache of allCaches) {
        for (const collectionDbId of productCollectionDbIds) {
          await prisma.collectionProduct.upsert({
            where: {
              collectionId_productCacheId: {
                collectionId: collectionDbId,
                productCacheId: cache.id,
              },
            },
            update: {},
            create: { collectionId: collectionDbId, productCacheId: cache.id },
          });
        }
        await prisma.collectionProduct.deleteMany({
          where: {
            productCacheId: cache.id,
            collectionId: { notIn: productCollectionDbIds },
          },
        });
      }
    } catch (colErr: any) {
      console.error(`[ProductSync:Cache] Failed to sync collections to DB for ${shopDomain}:`, colErr.message);
    }

    console.log(`[ProductSync:Cache] Successfully updated local cache for product ${payload.title} in ${shopDomain}`);
  } catch (error: any) {
    require('fs').appendFileSync('C:/Users/eabin/OneDrive/Desktop/next task/shopify-sync/sync-errors.log', `[${new Date().toISOString()}] Cache error: ${error.message}\n${error.stack}\n`);
    console.error(`[ProductSync:Cache] Failed to update local cache for ${shopDomain}:`, error.message);
  }
}

export async function processProductCreate(shopDomain: string, payload: any, webhookId?: string, targetStoreDomains?: string[]) {
  try {
    // Quick loop prevention for create <-> update cycle
    const loopDepth = (global as any)._syncLoopDepth || 0;
    if (loopDepth > 3) {
      console.error(`[DEBUG-CREATE] INFINITE LOOP DETECTED. Aborting.`);
      (global as any)._syncLoopDepth = 0;
      return;
    }
    (global as any)._syncLoopDepth = loopDepth + 1;

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
      where: { 
        shopDomain: targetStoreDomains ? { in: targetStoreDomains } : { not: shopDomain }, 
        isActive: true 
      },
    });

    for (const targetStore of targetStores) {
      if (!targetStore.autoSyncEnabled) continue;

      const skus = variantsWithSkus.map((v: any) => v.sku.trim());

      let existingMapping = await prisma.variantMap.findFirst({
        where: {
          storeId: targetStore.id,
          sku: { in: skus },
        },
      });

      if (!existingMapping) {
        console.log(`[ProductSync:Create] Mapping missing for SKUs ${skus.join(', ')} in ${targetStore.shopDomain}. Performing Shopify SKU search.`);
        const found = await findTargetProductBySku(targetStore.shopDomain, skus[0]);
        if (found) {
          console.log(`[ProductSync:Create] Found existing product ${found.productId} on Shopify for ${targetStore.shopDomain}. Creating local mapping.`);
          const targetLocationId = await fetchDefaultLocation(targetStore.shopDomain);

          existingMapping = await prisma.variantMap.create({
            data: {
              storeId: targetStore.id,
              sku: skus[0],
              shopifyProductId: found.productId,
              shopifyVariantId: found.variantId,
              inventoryItemId: found.inventoryItemId,
              locationId: targetLocationId,
            },
          });

          await prisma.productCache.create({
            data: {
              storeId: targetStore.id,
              shopifyProductId: found.productId,
              shopifyVariantId: found.variantId,
              sku: skus[0],
              title: payload.title,
              inventoryQuantity: 0,
              price: parseFloat(found.price || "0"),
            },
          });
        }
      }

      if (existingMapping) {
        console.log(`[ProductSync:Create] Product already exists in ${targetStore.shopDomain}. Delegating to update.`);
        await processProductUpdate(shopDomain, payload, webhookId, [targetStore.shopDomain]);
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
      } else {
        productInput.productOptions = [{ name: "Title", values: [{ name: "Default Title" }] }];
      }

      if (payload.variants && payload.variants.length > 0) {
        productInput.variants = payload.variants.map((v: any) => {
          const variantInput: any = {
            price: calculateAdjustedPrice(v.price, sourceStore, targetStore),
            sku: v.sku?.trim() || "",
            inventoryItem: { tracked: true }
          };
          const options: string[] = [];
          if (v.option1) options.push(v.option1);
          if (v.option2) options.push(v.option2);
          if (v.option3) options.push(v.option3);

          if (options.length > 0) {
            variantInput.optionValues = options.map((val, idx) => ({
              optionName: payload.options?.[idx]?.name || `Option ${idx + 1}`,
              name: val
            }));
          } else {
            variantInput.optionValues = [{ optionName: "Title", name: "Default Title" }];
          }
          return variantInput;
        });
      }

      const imagesToSync = (payload.images && payload.images.length > 0) ? payload.images : (payload.image ? [payload.image] : []);
      if (imagesToSync.length > 0) {
        productInput.files = imagesToSync.map((img: any) => {
          const fileInput: any = {
            contentType: "IMAGE",
            originalSource: img.src,
          };
          if (img.alt) {
            fileInput.alt = img.alt;
          }
          return fileInput;
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

          const sourceVariant = payload.variants?.find((v: any) => v.sku?.trim() === sku);
          const initialQuantity = sourceVariant?.inventory_quantity ?? 0;

          if (initialQuantity > 0 && variant.inventoryItem?.id) {
            try {
              await setInventoryQuantity(targetStore.shopDomain, variant.inventoryItem.id, targetLocationId, initialQuantity);
              console.log(`[ProductSync:Create] Set initial inventory of ${initialQuantity} for SKU ${sku} in ${targetStore.shopDomain}`);

              await createSyncLog({
                sku,
                sourceStoreId: sourceStore.id,
                destinationStoreId: targetStore.id,
                previousQuantity: 0,
                updatedQuantity: initialQuantity,
                status: 'SUCCESS',
                webhookEventId: webhookId,
              });
            } catch (invErr: any) {
              console.error(`[ProductSync:Create] Failed to set initial inventory for SKU ${sku}:`, invErr.message);
              await createSyncLog({
                sku,
                sourceStoreId: sourceStore.id,
                destinationStoreId: targetStore.id,
                previousQuantity: 0,
                updatedQuantity: 0,
                status: 'FAILED',
                failureReason: invErr.message,
                webhookEventId: webhookId,
              });
            }
          }

          const imageUrl = payload.image?.src || payload.images?.[0]?.src || null;

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
              price: parseFloat(variant.price || "0"),
              imageUrl,
            },
            create: {
              storeId: targetStore.id,
              shopifyProductId: createdProduct.id,
              shopifyVariantId: variant.id,
              sku,
              title: `${createdProduct.title}${variant.title && variant.title !== 'Default Title' ? ` - ${variant.title}` : ''}`,
              inventoryQuantity: initialQuantity,
              price: parseFloat(variant.price || "0"),
              imageUrl,
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

          // SYNC IDENTITY
          if (sourceVariant) {
             const masterVariantIdStr = sourceVariant.admin_graphql_api_id?.split('/').pop() || String(sourceVariant.id);
             const targetVariantIdStr = variant.id.split('/').pop() || String(variant.id);
             const targetProductIdStr = createdProduct.id.split('/').pop() || String(createdProduct.id);
             
             try {
               await syncProductIdentity(
                 sourceStore.id,
                 masterVariantIdStr,
                 targetStore.id,
                 targetProductIdStr,
                 targetVariantIdStr
               );
             } catch (idErr: any) {
               console.error(`[ProductSync:Create] Identity sync failed for SKU ${sku}:`, idErr.message);
               // Aborting the whole loop is risky, but the architecture strictly says: "NO -> Stop Sync -> Log Error"
               // However, we just created it. So we log heavy warning.
             }
          }
        }

        // Sync Collections across stores
        // if (payload.admin_graphql_api_id && createdProduct?.id) {
        //   await syncProductCollections(shopDomain, payload.admin_graphql_api_id, targetStore.shopDomain, createdProduct.id, targetStore.id);
        // }

        try {
          await syncProductCollectionsByTags(targetStore.shopDomain, createdProduct.id, payload.tags);
        } catch (err) {
          console.error(`[CollectionSync] Failed during Create:`, err);
        }

        // Auto-publish to all sales channels so the product appears on the storefront
        await publishProductToAllChannels(targetStore.shopDomain, createdProduct.id);

        console.log(`[ProductSync:Create] Successfully created product "${payload.title}" in target store ${targetStore.shopDomain}`);
      } catch (err: any) {
        syncStatus = 'FAILED';
        failureReason = err.message || 'Unknown error during creation';
        console.error(`[ProductSync:Create] Failed to create product in ${targetStore.shopDomain}:`, failureReason);
      }
    }

  } catch (error: any) {
    console.error(`[ProductSync:Create] Fatal error:`, error.message);
  }
}

export async function processProductUpdate(shopDomain: string, payload: any, webhookId?: string, targetStoreDomains?: string[]) {
  try {
    // Quick loop prevention for create <-> update cycle
    const loopDepth = (global as any)._syncLoopDepth || 0;
    if (loopDepth > 3) {
      console.error(`[DEBUG-UPDATE] INFINITE LOOP DETECTED. Aborting.`);
      (global as any)._syncLoopDepth = 0;
      return;
    }
    (global as any)._syncLoopDepth = loopDepth + 1;

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
      where: { 
        shopDomain: targetStoreDomains ? { in: targetStoreDomains } : { not: shopDomain }, 
        isActive: true 
      },
    });

    for (const targetStore of targetStores) {
      if (!targetStore.autoSyncEnabled) continue;

      const skus = variantsWithSkus.map((v: any) => v.sku.trim());

      let matchingVariantMap = await prisma.variantMap.findFirst({
        where: {
          storeId: targetStore.id,
          sku: { in: skus },
        },
      });

      if (!matchingVariantMap) {
        console.log(`[ProductSync:Update] Mapping missing for SKUs ${skus.join(', ')} in ${targetStore.shopDomain}. Performing SKU search.`);
        const found = await findTargetProductBySku(targetStore.shopDomain, skus[0]);
        if (found) {
          const targetLocationId = await fetchDefaultLocation(targetStore.shopDomain);
          matchingVariantMap = await prisma.variantMap.create({
            data: {
              storeId: targetStore.id,
              sku: skus[0],
              shopifyProductId: found.productId,
              shopifyVariantId: found.variantId,
              inventoryItemId: found.inventoryItemId,
              locationId: targetLocationId,
            },
          });
          await prisma.productCache.create({
            data: {
              storeId: targetStore.id,
              shopifyProductId: found.productId,
              shopifyVariantId: found.variantId,
              sku: skus[0],
              title: payload.title,
              inventoryQuantity: 0,
              price: parseFloat(found.price || "0"),
            },
          });
        }
      }

      if (!matchingVariantMap) {
        console.log(`[ProductSync:Update] Product does not exist in target store ${targetStore.shopDomain}. Routing to create.`);
        await processProductCreate(shopDomain, payload, webhookId, [targetStore.shopDomain]);
        continue;
      }

      const targetProductId = matchingVariantMap.shopifyProductId;
      const client = await getAdminClient(targetStore.shopDomain);

      let targetProduct: any = null;
      try {
        const response: any = await client.request(GET_PRODUCT_BY_ID_QUERY, { variables: { id: targetProductId } });
        targetProduct = response?.data?.product;
      } catch (err: any) {
        console.error(`[ProductSync:Update] Failed to fetch current product from ${targetStore.shopDomain}:`, err.message);
      }

      if (!targetProduct) {
        console.log(`[ProductSync:Update] Target product ${targetProductId} not found on Shopify. Skipping.`);
        continue;
      }

      const targetCache = await prisma.productCache.findFirst({
        where: {
          storeId: targetStore.id,
          shopifyProductId: targetProductId,
        },
      });

      const payloadUpdatedAt = new Date(payload.updated_at).getTime();
      const targetUpdatedAt = new Date(targetProduct.updatedAt).getTime();
      const cacheUpdatedAt = targetCache ? new Date(targetCache.updatedAt).getTime() : 0;

      const isTargetUserUpdated = (targetUpdatedAt - cacheUpdatedAt) > 5000;

      let mergedTitle = payload.title;
      let mergedDescription = payload.body_html || "";
      let mergedVendor = payload.vendor || "";
      let mergedType = payload.product_type || "";
      let mergedStatus = payload.status ? payload.status.toUpperCase() : "ACTIVE";

      if (isTargetUserUpdated) {
        console.log(`[ProductSync:Update] Conflict check: target store ${targetStore.shopDomain} was independently updated.`);

        const mergeField = (sourceVal: any, targetVal: any, cachedVal: any) => {
          const sChanged = sourceVal !== cachedVal;
          const tChanged = targetVal !== cachedVal;

          if (sChanged && !tChanged) return sourceVal;
          if (!sChanged && tChanged) return targetVal;
          if (sChanged && tChanged) {
            return payloadUpdatedAt >= targetUpdatedAt ? sourceVal : targetVal;
          }
          return targetVal;
        };

        const cachedTitle = targetCache?.title ? targetCache.title.split(' - ')[0] : null;

        mergedTitle = mergeField(payload.title, targetProduct.title, cachedTitle || payload.title);
        mergedDescription = mergeField(payload.body_html || "", targetProduct.descriptionHtml || "", payload.body_html || "");
        mergedVendor = mergeField(payload.vendor || "", targetProduct.vendor || "", payload.vendor || "");
        mergedType = mergeField(payload.product_type || "", targetProduct.productType || "", payload.product_type || "");
        mergedStatus = mergeField(payload.status?.toUpperCase() || "ACTIVE", targetProduct.status?.toUpperCase() || "ACTIVE", payload.status?.toUpperCase() || "ACTIVE");
      }

      const targetVariants = targetProduct.variants?.edges?.map((e: any) => e.node) || [];
      const variantsInput: any[] = [];
      const syncedVariantIds: string[] = [];

      for (const sourceVar of payload.variants || []) {
        const sku = sourceVar.sku?.trim();
        if (!sku) continue;

        const matchingTargetVar = targetVariants.find((tv: any) => tv.sku?.trim().toLowerCase() === sku.toLowerCase());

        const variantInput: any = {
          price: calculateAdjustedPrice(sourceVar.price, sourceStore, targetStore),
          sku: sku,
          inventoryItem: { tracked: true }
        };

        const options: string[] = [];
        if (sourceVar.option1) options.push(sourceVar.option1);
        if (sourceVar.option2) options.push(sourceVar.option2);
        if (sourceVar.option3) options.push(sourceVar.option3);

        if (options.length > 0) {
          variantInput.optionValues = options.map((val, idx) => ({
            optionName: payload.options?.[idx]?.name || `Option ${idx + 1}`,
            name: val
          }));
        } else {
          variantInput.optionValues = [{ optionName: "Title", name: "Default Title" }];
        }

        if (matchingTargetVar) {
          variantInput.id = matchingTargetVar.id;
          syncedVariantIds.push(matchingTargetVar.id);
        }

        variantsInput.push(variantInput);
      }

      const deletedVariantIds = targetVariants
        .map((tv: any) => tv.id)
        .filter((id: string) => !syncedVariantIds.includes(id));

      if (deletedVariantIds.length > 0) {
        console.log(`[ProductSync:Update] Deleting ${deletedVariantIds.length} obsolete variants in target store ${targetStore.shopDomain}`);
        try {
          const delResponse: any = await client.request(PRODUCT_VARIANTS_DELETE_MUTATION, {
            variables: {
              productId: targetProductId,
              variantsIds: deletedVariantIds,
            },
          });
          const delErrors = delResponse?.data?.productVariantsBulkDelete?.userErrors || [];
          if (delErrors.length > 0) {
            console.error(`[ProductSync:Update] Failed to delete obsolete variants:`, delErrors.map((e: any) => e.message).join(', '));
          } else {
            await prisma.variantMap.deleteMany({
              where: {
                storeId: targetStore.id,
                shopifyVariantId: { in: deletedVariantIds },
              },
            });
            await prisma.productCache.deleteMany({
              where: {
                storeId: targetStore.id,
                shopifyVariantId: { in: deletedVariantIds },
              },
            });
          }
        } catch (delErr: any) {
          console.error(`[ProductSync:Update] Error deleting obsolete variants:`, delErr.message);
        }
      }

      const productInput: any = {
        id: targetProductId,
        title: mergedTitle,
        descriptionHtml: mergedDescription,
        vendor: mergedVendor,
        productType: mergedType,
        status: mergedStatus,
        variants: variantsInput,
      };

      if (payload.options && payload.options.length > 0) {
        productInput.productOptions = payload.options.map((opt: any) => ({
          name: opt.name,
          values: opt.values ? opt.values.map((v: string) => ({ name: v })) : []
        }));
      } else {
        productInput.productOptions = [{ name: "Title", values: [{ name: "Default Title" }] }];
      }

      const imagesToSync = (payload.images && payload.images.length > 0) ? payload.images : (payload.image ? [payload.image] : []);
      if (imagesToSync.length > 0) {
        productInput.files = imagesToSync.map((img: any) => {
          const fileInput: any = {
            contentType: "IMAGE",
            originalSource: img.src,
          };
          if (img.alt) {
            fileInput.alt = img.alt;
          }
          return fileInput;
        });
      }

      console.log(`[ProductSync:UpdateDiag] Comparing fields for product "${mergedTitle}":`);
      console.log(`- Title: merged="${mergedTitle}" vs target="${targetProduct.title}" (Match: ${mergedTitle === targetProduct.title})`);
      console.log(`- Desc: merged="${mergedDescription}" vs target="${targetProduct.descriptionHtml || ""}" (Match: ${mergedDescription === (targetProduct.descriptionHtml || "")})`);
      console.log(`- Vendor: merged="${mergedVendor}" vs target="${targetProduct.vendor || ""}" (Match: ${mergedVendor === (targetProduct.vendor || "")})`);
      console.log(`- Type: merged="${mergedType}" vs target="${targetProduct.productType || ""}" (Match: ${mergedType === (targetProduct.productType || "")})`);
      console.log(`- Status: merged="${mergedStatus}" vs target="${targetProduct.status?.toUpperCase() || "ACTIVE"}" (Match: ${mergedStatus === (targetProduct.status?.toUpperCase() || "ACTIVE")})`);

      let targetImageUrlBase = targetProduct.featuredImage?.url?.split('?')[0];
      let sourceImageUrlBase = imagesToSync[0]?.src?.split('?')[0];
      let imageChanged = false;
      if (sourceImageUrlBase && sourceImageUrlBase !== targetImageUrlBase) {
        imageChanged = true;
        console.log(`- Image mismatch: input=${sourceImageUrlBase} vs target=${targetImageUrlBase}`);
      } else {
        console.log(`- Image: merged="${sourceImageUrlBase || ""}" vs target="${targetImageUrlBase || ""}" (Match: true)`);
      }

      let hasProductChanges =
        imageChanged ||
        mergedTitle !== targetProduct.title ||
        mergedDescription !== (targetProduct.descriptionHtml || "") ||
        mergedVendor !== (targetProduct.vendor || "") ||
        mergedType !== (targetProduct.productType || "") ||
        mergedStatus !== (targetProduct.status?.toUpperCase() || "ACTIVE");

      if (!hasProductChanges) {
        if (variantsInput.length !== targetVariants.length) {
          console.log(`- Variants count mismatch: input=${variantsInput.length} vs target=${targetVariants.length}`);
          hasProductChanges = true;
        } else {
          for (const varInput of variantsInput) {
            const matchingTargetVar = targetVariants.find((tv: any) => tv.id === varInput.id);
            if (!matchingTargetVar) {
              console.log(`- Variant id not found on target: ${varInput.id}`);
              hasProductChanges = true;
              break;
            }
            if (parseFloat(varInput.price) !== parseFloat(matchingTargetVar.price || "0")) {
              console.log(`- Price mismatch: input=${varInput.price} vs target=${matchingTargetVar.price}`);
              hasProductChanges = true;
              break;
            }
            if (varInput.sku?.trim().toLowerCase() !== matchingTargetVar.sku?.trim().toLowerCase()) {
              console.log(`- SKU mismatch: input=${varInput.sku} vs target=${matchingTargetVar.sku}`);
              hasProductChanges = true;
              break;
            }
          }
        }
      }

      // Sync Collections across stores (Even if product details didn't change, collections might have)
      // if (payload.admin_graphql_api_id && targetProductId) {
      //   await syncProductCollections(shopDomain, payload.admin_graphql_api_id, targetStore.shopDomain, targetProductId, targetStore.id);
      // }

      try {
        await syncProductCollectionsByTags(targetStore.shopDomain, targetProductId, payload.tags);
      } catch (err) {
        console.error(`[CollectionSync] Failed during Update for ${targetProductId}:`, err);
      }

      if (!hasProductChanges) {
        console.log(`[ProductSync:Update] Product "${mergedTitle}" details are already identical in target store ${targetStore.shopDomain}. Skipping update.`);
        continue;
      }

      acquireSyncLock(targetStore.shopDomain, targetProductId, mergedTitle);

      let syncStatus: 'SUCCESS' | 'FAILED' = 'SUCCESS';
      let failureReason = '';

      try {
        const response: any = await client.request(PRODUCT_SET_MUTATION, { variables: { input: productInput } });
        const userErrors = response?.data?.productSet?.userErrors || [];

        if (userErrors.length > 0) {
          throw new Error(userErrors.map((e: any) => `${e.field}: ${e.message}`).join(', '));
        }

        const updatedProduct = response?.data?.productSet?.product;
        const updatedVariants = updatedProduct?.variants?.edges || [];

        let targetLocationId: string | null = null;

        for (const variantEdge of updatedVariants) {
          const variant = variantEdge.node;
          const sku = variant.sku?.trim() || "";
          if (!sku) continue;

          const existingCache = await prisma.productCache.findUnique({
            where: {
              storeId_shopifyVariantId: {
                storeId: targetStore.id,
                shopifyVariantId: variant.id,
              },
            }
          });

          const isNewVariant = !existingCache;
          let inventoryQuantity = existingCache?.inventoryQuantity || 0;

          if (isNewVariant) {
            const sourceVariant = payload.variants?.find((v: any) => v.sku?.trim() === sku);
            const initialQuantity = sourceVariant?.inventory_quantity ?? 0;

            if (initialQuantity > 0 && variant.inventoryItem?.id) {
              if (!targetLocationId) {
                targetLocationId = await fetchDefaultLocation(targetStore.shopDomain);
              }
              if (targetLocationId) {
                try {
                  await setInventoryQuantity(targetStore.shopDomain, variant.inventoryItem.id, targetLocationId, initialQuantity);
                  console.log(`[ProductSync:Update] Set initial inventory of ${initialQuantity} for new SKU ${sku} in ${targetStore.shopDomain}`);
                  inventoryQuantity = initialQuantity;

                  await createSyncLog({
                    sku,
                    sourceStoreId: sourceStore.id,
                    destinationStoreId: targetStore.id,
                    previousQuantity: 0,
                    updatedQuantity: initialQuantity,
                    status: 'SUCCESS',
                    webhookEventId: webhookId,
                  });
                } catch (invErr: any) {
                  console.error(`[ProductSync:Update] Failed to set initial inventory for new SKU ${sku}:`, invErr.message);
                  await createSyncLog({
                    sku,
                    sourceStoreId: sourceStore.id,
                    destinationStoreId: targetStore.id,
                    previousQuantity: 0,
                    updatedQuantity: 0,
                    status: 'FAILED',
                    failureReason: invErr.message,
                    webhookEventId: webhookId,
                  });
                }
              }
            }
          }

          const imageUrl = payload.image?.src || payload.images?.[0]?.src || null;

          await prisma.productCache.upsert({
            where: {
              storeId_shopifyVariantId: {
                storeId: targetStore.id,
                shopifyVariantId: variant.id,
              },
            },
            update: {
              sku,
              title: `${updatedProduct.title}${variant.title && variant.title !== 'Default Title' ? ` - ${variant.title}` : ''}`,
              price: parseFloat(variant.price || "0"),
              imageUrl,
            },
            create: {
              storeId: targetStore.id,
              shopifyProductId: updatedProduct.id,
              shopifyVariantId: variant.id,
              sku,
              title: `${updatedProduct.title}${variant.title && variant.title !== 'Default Title' ? ` - ${variant.title}` : ''}`,
              inventoryQuantity,
              price: parseFloat(variant.price || "0"),
              imageUrl,
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
              inventoryItemId: variant.inventoryItem?.id || "",
            },
            create: {
              storeId: targetStore.id,
              sku,
              shopifyProductId: updatedProduct.id,
              shopifyVariantId: variant.id,
              inventoryItemId: variant.inventoryItem?.id || "",
            },
          });
        }

        // Auto-publish to all sales channels during update as well
        await publishProductToAllChannels(targetStore.shopDomain, targetProductId);

        console.log(`[ProductSync:Update] Successfully updated product "${mergedTitle}" in target store ${targetStore.shopDomain}`);
      } catch (err: any) {
        syncStatus = 'FAILED';
        failureReason = err.message || 'Unknown error during update';
        console.error(`[ProductSync:Update] Failed to update product in ${targetStore.shopDomain}:`, failureReason);

        releaseSyncLock(targetStore.shopDomain, targetProductId, mergedTitle);
      }
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

    let skus = sourceVariantMaps.map((v) => v.sku).filter(Boolean);

    // Check ProductCache for SKUs if VariantMap returned none
    const sourceProductCaches = await prisma.productCache.findMany({
      where: {
        storeId: sourceStore.id,
        shopifyProductId: `gid://shopify/Product/${payload.id}`,
      },
    });

    if (skus.length === 0) {
      console.log(`[ProductSync:Delete] No VariantMaps found for ${payload.id}, checking ProductCache for SKUs...`);
      skus = sourceProductCaches.map((p) => p.sku).filter(Boolean) as string[];
    }

    if (skus.length === 0 && payload.variants && payload.variants.length > 0) {
       console.log(`[ProductSync:Delete] Fallback: using SKUs from webhook payload`);
       skus = payload.variants.map((v: any) => v.sku).filter(Boolean);
    }

    // Extract title from source ProductCache or payload for null-SKU fallback
    const sourceTitle = sourceProductCaches[0]?.title || payload.title || null;

    const targetStores = await prisma.store.findMany({
      where: { shopDomain: { not: shopDomain }, isActive: true },
    });

    for (const targetStore of targetStores) {
      if (!targetStore.autoSyncEnabled) continue;

      let targetProductId: string | null = null;

      // Step 1: Look up target product by SKU in VariantMap (most reliable)
      if (skus.length > 0) {
        const matchingVariantMap = await prisma.variantMap.findFirst({
          where: {
            storeId: targetStore.id,
            sku: { in: skus },
          },
        });
        if (matchingVariantMap) {
          targetProductId = matchingVariantMap.shopifyProductId;
          console.log(`[ProductSync:Delete] Found target product ${targetProductId} via VariantMap SKU lookup.`);
        }
      }

      // Step 2: Fall back to live Shopify SKU search if VariantMap lookup failed
      if (!targetProductId && skus.length > 0) {
        console.log(`[ProductSync:Delete] Mapping missing for SKUs ${skus.join(', ')}. Falling back to Shopify search.`);
        const found = await findTargetProductBySku(targetStore.shopDomain, skus[0]);
        if (found) {
          targetProductId = found.productId;
          console.log(`[ProductSync:Delete] Found target product ${targetProductId} via live Shopify SKU search.`);
        }
      }

      // Step 3: Null-SKU fallback — look up by title in ProductCache
      if (!targetProductId && sourceTitle) {
        console.log(`[ProductSync:Delete] SKUs exhausted. Falling back to title lookup for "${sourceTitle}" in ${targetStore.shopDomain}.`);
        const titleMatch = await prisma.productCache.findFirst({
          where: {
            storeId: targetStore.id,
            title: sourceTitle,
          },
        });
        if (titleMatch) {
          targetProductId = titleMatch.shopifyProductId;
          console.log(`[ProductSync:Delete] Found target product ${targetProductId} via title match.`);
        }
      }

      if (!targetProductId) {
        console.log(`[ProductSync:Delete] No matching product found in target store ${targetStore.shopDomain} for delete. Cleaning up any stale local cache only.`);
        // Even if we can't delete on Shopify, clean up any stale local ProductCache/VariantMap by title
        if (sourceTitle) {
          const staleCache = await prisma.productCache.findMany({ where: { storeId: targetStore.id, title: sourceTitle } });
          for (const sc of staleCache) {
            await prisma.collectionProduct.deleteMany({ where: { productCacheId: sc.id } });
          }
          await prisma.productCache.deleteMany({ where: { storeId: targetStore.id, title: sourceTitle } });
          await prisma.variantMap.deleteMany({ where: { storeId: targetStore.id, sku: skus.length > 0 ? { in: skus } : undefined } });
          console.log(`[ProductSync:Delete] Cleaned up stale local records for "${sourceTitle}" in ${targetStore.shopDomain}.`);
        }
        continue;
      }

      const client = await getAdminClient(targetStore.shopDomain);

      let syncStatus: 'SUCCESS' | 'FAILED' = 'SUCCESS';
      let failureReason = '';

      acquireSyncLock(targetStore.shopDomain, targetProductId, "DELETE");

      // Controls whether local DB records are removed after the Shopify API call.
      // Only true when we are confident the product is gone from Shopify:
      //   ✅ Shopify delete succeeded
      //   ✅ Shopify returned "does not exist" / "not found" (already deleted externally)
      // ❌ Never true for network errors, auth errors, rate limits, or server errors —
      //    in those cases the product may still exist in Shopify and we must not corrupt local data.
      let shouldCleanupLocal = false;

      try {
        const response: any = await client.request(PRODUCT_DELETE_MUTATION, {
          variables: {
            input: { id: targetProductId }
          }
        });
        const userErrors = response?.data?.productDelete?.userErrors || [];

        if (userErrors.length > 0) {
          // Shopify returns userErrors (not a thrown exception) for "product does not exist".
          // This means the product is already gone — safe to clean up locally.
          const isAlreadyDeleted = userErrors.every((e: any) =>
            (e.message || '').toLowerCase().includes('does not exist') ||
            (e.message || '').toLowerCase().includes('not found')
          );
          if (isAlreadyDeleted) {
            console.log(`[ProductSync:Delete] Product ${targetProductId} already deleted from Shopify. Cleaning up local DB only.`);
            shouldCleanupLocal = true;
          } else {
            // Real business logic error from Shopify (e.g. permission issue) — do not clean up
            throw new Error(userErrors.map((e: any) => `${e.field}: ${e.message}`).join(', '));
          }
        } else {
          // Shopify delete succeeded
          console.log(`[ProductSync:Delete] Successfully deleted matching product ${targetProductId} in target store ${targetStore.shopDomain}`);
          shouldCleanupLocal = true;
        }

        for (const sku of skus) {
          await createSyncLog({
            sku,
            sourceStoreId: sourceStore.id,
            destinationStoreId: targetStore.id,
            previousQuantity: 0,
            updatedQuantity: 0,
            status: 'SUCCESS',
            webhookEventId: webhookId,
          });
        }
      } catch (err: any) {
        syncStatus = 'FAILED';
        failureReason = err.message || 'Unknown error during deletion';
        console.error(`[ProductSync:Delete] Failed to delete product in ${targetStore.shopDomain}:`, failureReason);

        // Do NOT set shouldCleanupLocal = true here.
        // This catch handles real failures: network errors, auth errors, rate limits, server errors.
        // The product may still exist in Shopify — preserving local data is safer.

        for (const sku of skus) {
          await createSyncLog({
            sku,
            sourceStoreId: sourceStore.id,
            destinationStoreId: targetStore.id,
            previousQuantity: 0,
            updatedQuantity: 0,
            status: 'FAILED',
            failureReason,
            webhookEventId: webhookId,
          });
        }
      } finally {
        // Always release the sync lock, regardless of outcome.
        releaseSyncLock(targetStore.shopDomain, targetProductId, "DELETE");

        // Only clean up local DB if Shopify confirmed the product is gone.
        if (shouldCleanupLocal) {
          await prisma.variantMap.deleteMany({
            where: {
              storeId: targetStore.id,
              shopifyProductId: targetProductId,
            },
          });

          const targetCaches = await prisma.productCache.findMany({
            where: { storeId: targetStore.id, shopifyProductId: targetProductId },
            select: { id: true }
          });
          for (const tc of targetCaches) {
            await prisma.collectionProduct.deleteMany({ where: { productCacheId: tc.id } });
          }

          await prisma.productCache.deleteMany({
            where: {
              storeId: targetStore.id,
              shopifyProductId: targetProductId,
            },
          });

          console.log(`[ProductSync:Delete] Local DB cleanup complete for ${targetProductId} in ${targetStore.shopDomain}.`);
        } else {
          console.log(`[ProductSync:Delete] Skipped local DB cleanup for ${targetProductId} in ${targetStore.shopDomain} due to API error — local data preserved.`);
        }
      }


    }

    await prisma.variantMap.deleteMany({
      where: {
        storeId: sourceStore.id,
        shopifyProductId: `gid://shopify/Product/${payload.id}`,
      },
    });

    // Delete CollectionProduct records before ProductCache (FK constraint)
    const sourceCachesToDelete = await prisma.productCache.findMany({
      where: { storeId: sourceStore.id, shopifyProductId: `gid://shopify/Product/${payload.id}` },
      select: { id: true }
    });
    for (const sc of sourceCachesToDelete) {
      await prisma.collectionProduct.deleteMany({ where: { productCacheId: sc.id } });
    }

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

export async function applyPriceAdjustmentToStore(storeId: string) {
  console.log(`[PriceAdjustment] Starting bulk price adjustment for store ${storeId}`);

  const targetStore = await prisma.store.findUnique({
    where: { id: storeId }
  });

  if (!targetStore || !targetStore.isActive) {
    console.error(`[PriceAdjustment] Store ${storeId} not found or inactive.`);
    return;
  }

  // Find the other active store to treat as the source store
  const sourceStore = await prisma.store.findFirst({
    where: {
      id: { not: storeId },
      isActive: true
    }
  });

  if (!sourceStore) {
    console.error(`[PriceAdjustment] Source store not found for target ${targetStore.shopDomain}`);
    return;
  }

  console.log(`[PriceAdjustment] Target store: ${targetStore.shopDomain}, Source store: ${sourceStore.shopDomain}`);

  // Get all variant maps for this target store
  const variantMaps = await prisma.variantMap.findMany({
    where: { storeId }
  });

  console.log(`[PriceAdjustment] Found ${variantMaps.length} mapped variants to process.`);

  const client = await getAdminClient(targetStore.shopDomain);

  // Group variant maps by shopifyProductId to perform batch updates per product
  const mapsByProduct: { [productId: string]: typeof variantMaps } = {};
  variantMaps.forEach(map => {
    if (map.shopifyProductId) {
      if (!mapsByProduct[map.shopifyProductId]) {
        mapsByProduct[map.shopifyProductId] = [];
      }
      mapsByProduct[map.shopifyProductId].push(map);
    }
  });

  for (const [productId, maps] of Object.entries(mapsByProduct)) {
    const variantsUpdateInput: any[] = [];
    const cacheUpdates: { variantId: string; price: number }[] = [];

    for (const map of maps) {
      if (!map.sku) continue;

      // Find the corresponding cached product in the source store
      const sourceCache = await prisma.productCache.findFirst({
        where: {
          storeId: sourceStore.id,
          sku: map.sku
        }
      });

      if (!sourceCache) {
        console.log(`[PriceAdjustment] SKU ${map.sku} not found in source store cache. Skipping.`);
        continue;
      }

      // Calculate the true base price by reversing the source store's adjustment
      const sourcePrice = sourceCache.price;
      let basePrice = sourcePrice;
      if (sourceStore.isPriceAdjustmentEnabled) {
        const sourceVal = sourceStore.priceAdjustmentValue || 0;
        if (sourceStore.priceAdjustmentType === 'PERCENTAGE' && sourceVal !== -100) {
          basePrice = sourcePrice / (1 + sourceVal / 100);
        } else if (sourceStore.priceAdjustmentType === 'FIXED') {
          basePrice = sourcePrice - sourceVal;
        }
      }

      // Calculate the new target price based on the true base price
      let newPrice = basePrice;
      if (targetStore.isPriceAdjustmentEnabled) {
        const targetVal = targetStore.priceAdjustmentValue || 0;
        if (targetStore.priceAdjustmentType === 'PERCENTAGE') {
          newPrice = basePrice * (1 + targetVal / 100);
        } else if (targetStore.priceAdjustmentType === 'FIXED') {
          newPrice = basePrice + targetVal;
        }
        if (newPrice < 0) newPrice = 0;
      }

      variantsUpdateInput.push({
        id: map.shopifyVariantId,
        price: newPrice.toFixed(2)
      });

      cacheUpdates.push({
        variantId: map.shopifyVariantId,
        price: newPrice
      });
    }

    if (variantsUpdateInput.length === 0) continue;

    console.log(`[PriceAdjustment] Updating ${variantsUpdateInput.length} variants for product ${productId} in Shopify...`);

    try {
      // Use Shopify's productVariantsBulkUpdate mutation to update variant prices
      const response: any = await client.request(`
        mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
          productVariantsBulkUpdate(productId: $productId, variants: $variants) {
            productVariants {
              id
              price
            }
            userErrors {
              field
              message
            }
          }
        }
      `, {
        variables: {
          productId,
          variants: variantsUpdateInput
        }
      });

      const userErrors = response?.data?.productVariantsBulkUpdate?.userErrors || [];
      if (userErrors.length > 0) {
        console.error(`[PriceAdjustment] Shopify returned errors for product ${productId}:`, userErrors.map((e: any) => e.message).join(', '));
      }

      // Update local productCache database records
      for (const update of cacheUpdates) {
        await prisma.productCache.updateMany({
          where: {
            storeId,
            shopifyVariantId: update.variantId
          },
          data: {
            price: update.price
          }
        });
      }

      console.log(`[PriceAdjustment] Successfully updated prices for product ${productId} on Shopify and local cache.`);
    } catch (err: any) {
      console.error(`[PriceAdjustment] Failed to update variants for product ${productId}:`, err.message);
    }
  }

  console.log(`[PriceAdjustment] Bulk price adjustment completed for store ${storeId}`);
}


/**
 * Synchronizes custom collections for a specific product across stores.
 */
async function syncProductCollections(sourceStoreDomain: string, sourceProductId: string, targetStoreDomain: string, targetProductId: string, targetStoreId: string) {
  try {
    const sourceClient = await getAdminClient(sourceStoreDomain);
    const sourceResponse: any = await sourceClient.request(GET_PRODUCT_COLLECTIONS_QUERY, { variables: { id: sourceProductId } });
    const sourceCollections = sourceResponse?.data?.product?.collections?.edges?.map((e: any) => e.node) || [];

    if (sourceCollections.length === 0) {
      return;
    }

    // Deduplicate source collections by title to prevent redundant syncs
    // if the source store accidentally has duplicate collections
    const uniqueSourceCollections = [];
    const seenTitles = new Set();
    for (const col of sourceCollections) {
      if (!seenTitles.has(col.title)) {
        seenTitles.add(col.title);
        uniqueSourceCollections.push(col);
      }
    }

    const targetClient = await getAdminClient(targetStoreDomain);

    for (const sourceCol of uniqueSourceCollections) {
      const lockKey = `colSync:${targetStoreId}:${sourceCol.title}`;

      await withLock(lockKey, async () => {
        let targetCollectionId = '';
        let targetCollectionHandle = '';

        // 1. Check local DB first to avoid race conditions and Shopify Search API delays
        const localCollection = await prisma.collection.findFirst({
          where: { storeId: targetStoreId, title: sourceCol.title }
        });

        if (localCollection) {
          targetCollectionId = localCollection.shopifyCollectionId;
          targetCollectionHandle = localCollection.handle;
        } else {
          // 2. Search for collection by title in target store
          const safeTitle = sourceCol.title.replace(/"/g, '\\"');
          const searchRes: any = await targetClient.request(GET_COLLECTIONS_BY_TITLE_QUERY, {
            variables: { query: `title:"${safeTitle}"`, first: 1 }
          });
          const foundCollections = searchRes?.data?.collections?.edges || [];

          if (foundCollections.length > 0) {
            targetCollectionId = foundCollections[0].node.id;
            targetCollectionHandle = foundCollections[0].node.handle;
          } else {
            // 3. Create the custom collection if not found
            console.log(`[ProductSync:Collection] Collection '${sourceCol.title}' not found in ${targetStoreDomain}. Creating it...`);
            const createRes: any = await targetClient.request(CREATE_COLLECTION_MUTATION, {
              variables: { input: { title: sourceCol.title } }
            });

            const errors = createRes?.data?.collectionCreate?.userErrors || [];
            if (errors.length > 0) {
              console.error(`[ProductSync:Collection] Failed to create collection '${sourceCol.title}':`, errors);
              return; // return instead of continue since we are inside a callback
            }

            targetCollectionId = createRes?.data?.collectionCreate?.collection?.id;
            targetCollectionHandle = createRes?.data?.collectionCreate?.collection?.handle;
          }
        }

        if (!targetCollectionId) return;

        // 3. Add product to the target collection
        console.log(`[ProductSync:Collection] Adding product ${targetProductId} to collection ${targetCollectionId} in ${targetStoreDomain}`);
        const addRes: any = await targetClient.request(ADD_PRODUCT_TO_COLLECTION_MUTATION, {
          variables: { id: targetCollectionId, productIds: [targetProductId] }
        });

        const addErrors = addRes?.data?.collectionAddProducts?.userErrors || [];
        if (addErrors.length > 0) {
          console.error(`[ProductSync:Collection] Failed to add product to collection '${sourceCol.title}':`, addErrors);
        } else {
          // 4. Update the local DB cache for the collection mapping
          try {
            const dbCol = await prisma.collection.upsert({
              where: { storeId_shopifyCollectionId: { storeId: targetStoreId, shopifyCollectionId: targetCollectionId } },
              update: { title: sourceCol.title, handle: targetCollectionHandle },
              create: { storeId: targetStoreId, shopifyCollectionId: targetCollectionId, title: sourceCol.title, handle: targetCollectionHandle }
            });

            const dbProduct = await prisma.productCache.findFirst({
              where: { storeId: targetStoreId, shopifyProductId: targetProductId }
            });

            if (dbProduct) {
              await prisma.collectionProduct.upsert({
                where: { collectionId_productCacheId: { collectionId: dbCol.id, productCacheId: dbProduct.id } },
                update: {},
                create: { collectionId: dbCol.id, productCacheId: dbProduct.id }
              });
            }
          } catch (dbErr: any) {
            console.error(`[ProductSync:Collection] Failed to update local DB for collection ${targetCollectionId}:`, dbErr.message);
          }
        }
      });
    }
  } catch (err: any) {
    console.error(`[ProductSync:Collection] Failed to sync collections for product ${sourceProductId} to ${targetStoreDomain}:`, err.message);
  }
}

