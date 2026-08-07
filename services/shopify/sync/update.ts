import { processProductCreate } from './create';
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
      console.log(`≡ƒöä [Target Store Sync (UPDATE)] -> ${targetStore.shopDomain}`);
      console.log(`------------------------------------------------------\n`);

      // 0. Deduplication (Idempotency)
      if (webhookId) {
        const existingSync = await prisma.syncLog.findFirst({
          where: {
            webhookEventId: webhookId,
            syncType: "PRODUCT_UPDATE",
            destinationStoreId: targetStore.id,
            status: { in: ["SUCCESS", "PROCESSING", "PENDING", "RETRYING"] }
          }
        });
        if (existingSync) {
          console.log(`[ProductSync:Update] Skipping duplicate webhook ${webhookId} for ${targetStore.shopDomain}`);
          continue;
        }
      }

      // 1. PRIMARY LOOKUP: Product Unique ID
      let matchingVariantMap: any = null;
      console.log(`[Primary Lookup]`);
      console.log(`≡ƒöì Checking Unique ID for master variant ${masterVariantStr}...\n`);
      const masterMapping = await prisma.productMapping.findUnique({
        where: { storeId_shopifyVariantId: { storeId: sourceStore.id, shopifyVariantId: masterVariantStr } }
      });

      if (masterMapping) {
        console.log(`✅ Master Unique ID found: ${masterMapping.productUniqueId}\n`);
        matchingVariantMap = await prisma.productMapping.findFirst({
          where: {
            storeId: targetStore.id,
            productUniqueId: masterMapping.productUniqueId
          }
        });

        if (!matchingVariantMap) {
          matchingVariantMap = await prisma.productMapping.findFirst({
            where: {
              storeId: targetStore.id,
              sku: { in: skus },
            },
          });

          // Repair mapping if fallback succeeds
          if (matchingVariantMap) {
            console.log(`🛠️ Target Mapping found via SKU in ProductMapping! Repairing Unique ID link...\n`);
            await prisma.productMapping.update({
              where: { id: matchingVariantMap.id },
              data: { productUniqueId: masterMapping.productUniqueId }
            });
          }
        } else {
          console.log(`✅ Target Mapping found via Unique ID!\n`);
        }
      }

      // 2. FALLBACK LOOKUP: VariantMap
      if (!matchingVariantMap) {
        console.log(`⚠️ Target Mapping NOT found in ProductMapping. Falling back to VariantMap lookup...\n`);
        matchingVariantMap = await prisma.variantMap.findFirst({
          where: {
            storeId: targetStore.id,
            sku: { in: skus },
          },
        });
        if (matchingVariantMap) {
          console.log(`✅ Target Mapping found via SKU in VariantMap!\n`);
        }
      }

      if (!matchingVariantMap) {
        console.log(`❌ Target Mapping NOT found via SKU either. Will attempt create flow.\n`);
        console.log(`[ProductSync:Update] Product does not exist in target store ${targetStore.shopDomain}. Routing to create.`);
        await processProductCreate(shopDomain, payload, webhookId, [targetStore.shopDomain]);
        continue;
      }

      let targetProductId = matchingVariantMap.shopifyProductId;
      if (!targetProductId.startsWith('gid://')) {
        targetProductId = `gid://shopify/Product/${targetProductId}`;
      }
      
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

        const productCollections = payload.tags ? payload.tags.split(',').map((t: string) => t.trim()) : [];
        const variantInput: any = {
          price: await calculateAdjustedPrice(sourceVar.price, sourceStore, targetStore, productCollections),
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

      let updatedProduct: any = null;

      const syncResult = await executeWithRetry({
        targetStoreDomain: targetStore.shopDomain,
        targetStoreId: targetStore.id,
        sourceStoreId: sourceStore.id,
        webhookEventId: webhookId,
        syncType: "PRODUCT_UPDATE",
        webhookTopic: "products/update",
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
        console.error(`[ProductSync:Update] Failed to update product in ${targetStore.shopDomain} after ${syncResult.retryCount} retries:`, syncResult.errorMessage);
        releaseSyncLock(targetStore.shopDomain, targetProductId, mergedTitle);
        continue;
      }

      updatedProduct = syncResult.payload?.data?.productSet?.product;
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

          const variantTitle = variant.title && variant.title !== "Default Title" ? `${updatedProduct.title} - ${variant.title}` : updatedProduct.title;

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
              price: parseFloat(variant.price || "0"),
              imageUrl,
              tags: payload.tags || null,
            },
            create: {
              storeId: targetStore.id,
              shopifyProductId: updatedProduct.id,
              shopifyVariantId: variant.id,
              sku,
              title: variantTitle,
              inventoryQuantity,
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

        console.log(`[ProductSync:Update] Successfully updated product "${mergedTitle}" in target store ${targetStore.shopDomain} (Request ID: ${syncResult.requestId}, Duration: ${syncResult.durationMs}ms)`);
        releaseSyncLock(targetStore.shopDomain, targetProductId, mergedTitle);
    }

  } catch (error: any) {
    console.error(`[ProductSync:Update] Fatal error:`, error.message);
  }
}

