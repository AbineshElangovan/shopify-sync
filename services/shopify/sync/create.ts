import { processProductUpdate } from './update';
import { prisma } from '@/lib/db/prisma';
import { getAdminClient } from '@/lib/shopify/admin';
import { setInventoryQuantity } from '@/lib/shopify/inventory';
import { createSyncLog } from '@/lib/shopify/sync-log';
import { linkConnectedProductMapping, findMappingByVariantId } from '@/services/product-mapping';
import {
  PRODUCT_SET_MUTATION, PRODUCT_DELETE_MUTATION, PRODUCT_VARIANTS_DELETE_MUTATION,
  GET_VARIANT_BY_SKU_QUERY, GET_PRODUCT_BY_ID_QUERY, LOCATIONS_QUERY,
  GET_PRODUCT_COLLECTIONS_QUERY, GET_COLLECTIONS_BY_TITLE_QUERY, CREATE_COLLECTION_MUTATION,
  ADD_PRODUCT_TO_COLLECTION_MUTATION, GET_PUBLICATIONS_QUERY, PUBLISH_MUTATION
} from '../graphql';
import { syncProductCollectionsByTags } from '../collection-sync';

import { withLock, acquireSyncLock, hasSyncLock, releaseSyncLock } from '../locks';
import { calculateAdjustedPrice } from '../pricing';
import { fetchDefaultLocation, publishProductToAllChannels, findTargetProductBySku } from '../api-helpers';
import { updateLocalProductCache } from '../../product-cache';
import { executeWithRetry } from './retry-handler';

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

    let targetStores: any[] = [];
    if (targetStoreDomains) {
      targetStores = await prisma.store.findMany({
        where: { shopDomain: { in: targetStoreDomains }, isActive: true },
      });
    } else {
      const connections = await prisma.storeConnection.findMany({
        where: { sourceStoreId: sourceStore.id },
        include: { targetStore: true }
      });
      targetStores = connections.map((c: any) => c.targetStore).filter((s: any) => s.isActive);
    }

    // --- FETCH ACTUAL COLLECTIONS AND CATEGORY FROM MASTER STORE ---
    let actualMasterCollections: string[] = [];
    try {
      const sourceClient = await getAdminClient(shopDomain);
      const masterProductId = payload.admin_graphql_api_id || `gid://shopify/Product/${payload.id}`;
      const sourceProductResponse: any = await sourceClient.request(`
        query getProductCollections($id: ID!) {
          product(id: $id) {
            category {
              id
            }
            collections(first: 20) {
              edges {
                node {
                  title
                }
              }
            }
          }
        }
      `, { variables: { id: masterProductId } });
      
      const edges = sourceProductResponse?.data?.product?.collections?.edges || [];
      actualMasterCollections = edges.map((e: any) => e.node.title);
      payload.category_id = sourceProductResponse?.data?.product?.category?.id || null;
    } catch (err) {
      console.error(`[ProductSync] Failed to fetch master collections for ${payload.id}:`, err);
    }

    const tagsFromPayload = payload.tags ? payload.tags.split(',').map((t: string) => t.trim()) : [];
    const combinedTagsAndCollections = Array.from(new Set([...tagsFromPayload, ...actualMasterCollections])).join(',');
    
    // Override payload.tags so everything downstream uses the true combined collections list
    payload.tags = combinedTagsAndCollections;

    for (const targetStore of targetStores) {
      if (!targetStore.autoSyncEnabled) continue;

      const skus = variantsWithSkus.map((v: any) => v.sku.trim());
      const masterVariantStr = variantsWithSkus[0]?.admin_graphql_api_id?.split('/').pop() || String(variantsWithSkus[0]?.id);

      console.log(`\n------------------------------------------------------`);
      console.log(`≡ƒÜÇ [Target Store Sync] -> ${targetStore.shopDomain}`);
      console.log(`------------------------------------------------------\n`);

      // 0. Deduplication (Idempotency)
      if (webhookId) {
        const existingSync = await prisma.syncLog.findFirst({
          where: {
            webhookEventId: webhookId,
            syncType: "PRODUCT_CREATE",
            destinationStoreId: targetStore.id,
            status: { in: ["SUCCESS", "PROCESSING", "PENDING", "RETRYING"] }
          }
        });
        if (existingSync) {
          console.log(`[ProductSync:Create] Skipping duplicate webhook ${webhookId} for ${targetStore.shopDomain}`);
          continue;
        }
      }

      // 1. PRIMARY LOOKUP: Product Unique ID
      let existingMapping: any = null;
      console.log(`[Primary Lookup]`);
      console.log(`≡ƒöì Checking Unique ID for master variant ${masterVariantStr}...\n`);
      const masterMapping = await prisma.productMapping.findUnique({
        where: { storeId_shopifyVariantId: { storeId: sourceStore.id, shopifyVariantId: masterVariantStr } }
      });

      if (masterMapping) {
        console.log(`✅ Master Unique ID found: ${masterMapping.productUniqueId}\n`);
        existingMapping = await prisma.productMapping.findFirst({
          where: { storeId: targetStore.id, productUniqueId: masterMapping.productUniqueId }
        });
        if (existingMapping) {
           console.log(`✅ Target Mapping found via Unique ID! Sync will process using Product Unique ID.\n`);
        }
      }

      // 2. FALLBACK LOOKUP: SKU (if Unique ID mapping not found)
      if (!existingMapping) {
        console.log(`[Fallback Lookup]`);
        console.log(`⚠️ Target Mapping NOT found via Unique ID. Falling back to SKU lookup...\n`);
        existingMapping = await prisma.productMapping.findFirst({
          where: {
            storeId: targetStore.id,
            sku: { in: skus },
          },
        });

        // Repair mapping if fallback succeeds
        if (existingMapping && masterMapping) {
          console.log(`🛠️ Target Mapping found via SKU! Repairing Unique ID link...\n`);
          await prisma.productMapping.update({
            where: { id: existingMapping.id },
            data: { productUniqueId: masterMapping.productUniqueId }
          });
        } else if (!existingMapping) {
          console.log(`❌ Target Mapping NOT found via SKU either. Will create new product.\n`);
        }
      }

      if (!existingMapping) {
        console.log(`[ProductSync:Create] Mapping missing for SKUs ${skus.join(', ')} in ${targetStore.shopDomain}. Performing Shopify SKU search.`);
        const found = await findTargetProductBySku(targetStore.shopDomain, skus[0]);
        if (found) {
          console.log(`[ProductSync:Create] Found existing product ${found.productId} on Shopify for ${targetStore.shopDomain}. Creating local mapping.`);
          const targetLocationId = await fetchDefaultLocation(targetStore.shopDomain);

          existingMapping = await prisma.variantMap.upsert({
            where: {
              storeId_shopifyVariantId: {
                storeId: targetStore.id,
                shopifyVariantId: found.variantId
              }
            },
            update: {
              sku: skus[0],
              shopifyProductId: found.productId,
              inventoryItemId: found.inventoryItemId,
              locationId: targetLocationId,
            },
            create: {
              storeId: targetStore.id,
              sku: skus[0],
              shopifyProductId: found.productId,
              shopifyVariantId: found.variantId,
              inventoryItemId: found.inventoryItemId,
              locationId: targetLocationId,
            },
          });

          await prisma.productCache.upsert({
            where: {
              storeId_shopifyVariantId: {
                storeId: targetStore.id,
                shopifyVariantId: found.variantId
              }
            },
            update: {
              sku: skus[0],
              title: payload.title,
            },
            create: {
              storeId: targetStore.id,
              shopifyProductId: found.productId,
              shopifyVariantId: found.variantId,
              sku: skus[0],
              title: payload.title,
              inventoryQuantity: 0,
              price: parseFloat(found.price || "0"),
            }
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

      if (payload.category_id) {
        productInput.category = payload.category_id;
      }

      if (payload.options && payload.options.length > 0) {
        productInput.productOptions = payload.options.map((opt: any) => ({
          name: opt.name,
          values: opt.values ? opt.values.map((v: string) => ({ name: v })) : []
        }));
      } else {
        productInput.productOptions = [{ name: "Title", values: [{ name: "Default Title" }] }];
      }

      if (payload.variants && payload.variants.length > 0) {
        const productCollections = payload.tags ? payload.tags.split(',').map((t: string) => t.trim()) : [];
        productInput.variants = await Promise.all(payload.variants.map(async (v: any) => {
          const variantInput: any = {
            price: await calculateAdjustedPrice(v.price, sourceStore, targetStore, productCollections),
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
        }));
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

      let createdProduct: any = null;

      const syncResult = await executeWithRetry({
        targetStoreDomain: targetStore.shopDomain,
        targetStoreId: targetStore.id,
        sourceStoreId: sourceStore.id,
        webhookEventId: webhookId,
        syncType: "PRODUCT_CREATE",
        webhookTopic: "products/create",
        sku: skus[0] || "UNKNOWN"
      }, async () => {
        const response: any = await client.request(PRODUCT_SET_MUTATION, { variables: { input: productInput } });
        const userErrors = response?.data?.productSet?.userErrors || [];

        if (userErrors.length > 0) {
          throw new Error(userErrors.map((e: any) => `${e.field}: ${e.message}`).join(', '));
        }
        return response;
      });

      if (!syncResult.success) {
        console.error(`[ProductSync:Create] Failed to create product in ${targetStore.shopDomain} after ${syncResult.retryCount} retries:`, syncResult.errorMessage);
        continue;
      }

      createdProduct = syncResult.payload?.data?.productSet?.product;
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

          const variantTitle = variant.title && variant.title !== "Default Title" ? `${createdProduct.title} - ${variant.title}` : createdProduct.title;

          await prisma.productCache.upsert({
            where: {
              storeId_shopifyVariantId: {
                storeId: targetStore.id,
                shopifyVariantId: variant.id,
              },
            },
            update: {
              sku,
              title: variantTitle,
              shopifyProductId: createdProduct.id,
              price: parseFloat(variant.price || "0"),
              imageUrl,
              tags: payload.tags || null,
            },
            create: {
              storeId: targetStore.id,
              shopifyProductId: createdProduct.id,
              shopifyVariantId: variant.id,
              sku,
              title: variantTitle,
              inventoryQuantity: initialQuantity,
              price: parseFloat(variant.price || "0"),
              imageUrl,
              tags: payload.tags || null,
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
              const masterMapping = await findMappingByVariantId(sourceStore.id, masterVariantIdStr);
              if (masterMapping) {
                await linkConnectedProductMapping(
                  masterMapping.productUniqueId,
                  targetStore.id,
                  targetProductIdStr,
                  targetVariantIdStr,
                  sku,
                  variant.inventoryItem?.id || null
                );
              } else {
                console.error(`[ProductSync:Create] Master mapping not found for SKU ${sku}`);
              }
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

        console.log(`[ProductSync:Create] Successfully created product "${payload.title}" in target store ${targetStore.shopDomain} (Request ID: ${syncResult.requestId}, Duration: ${syncResult.durationMs}ms)`);
      }
    } finally {
      (global as any)._syncLoopDepth = Math.max(0, ((global as any)._syncLoopDepth || 1) - 1);
    }
  } catch (error: any) {
    console.error(`[ProductSync:Create] Fatal error:`, error.message);
  }
}
