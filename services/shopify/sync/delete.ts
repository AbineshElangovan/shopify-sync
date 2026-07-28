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

    let skus: string[] = [];

    // Check ProductCache for SKUs if VariantMap returned none
    const sourceProductCaches = await prisma.productCache.findMany({
      where: {
        storeId: sourceStore.id,
        shopifyProductId: payload.admin_graphql_api_id || `gid://shopify/Product/${payload.id}`,
      },
    });

    if (sourceProductCaches.length > 0) {
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

    const masterProductIdStr = `gid://shopify/Product/${payload.id}`;
    const masterMapping = await prisma.productMapping.findFirst({
      where: { storeId: sourceStore.id, shopifyProductId: masterProductIdStr }
    });

    for (const targetStore of targetStores) {
      if (!targetStore.autoSyncEnabled) continue;

      let targetProductId: string | null = null;
      let targetMappingId: string | null = null;

      // 1. PRIMARY LOOKUP: Product Unique ID
      if (masterMapping) {
        const targetMapping = await prisma.productMapping.findFirst({
          where: { storeId: targetStore.id, productUniqueId: masterMapping.productUniqueId }
        });
        if (targetMapping) {
          console.log(`[ProductSync:Delete] ✅ Found target product via Unique ID mapping in ${targetStore.shopDomain}.`);
          targetProductId = targetMapping.shopifyProductId;
          targetMappingId = targetMapping.id;
        }
      }

      // 2. FALLBACK LOOKUP: SKU in ProductMapping
      if (!targetProductId && skus.length > 0) {
         const targetMapping = await prisma.productMapping.findFirst({
           where: { storeId: targetStore.id, sku: { in: skus } }
         });
         if (targetMapping) {
           console.log(`[ProductSync:Delete] 🛠️ Found target product via SKU mapping in ${targetStore.shopDomain}.`);
           targetProductId = targetMapping.shopifyProductId;
           targetMappingId = targetMapping.id;
         }
      }

      // 3. FALLBACK LOOKUP: Legacy VariantMap
      if (!targetProductId && skus.length > 0) {
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

      // 4. FALLBACK LOOKUP: Shopify live search
      if (!targetProductId && skus.length > 0) {
        console.log(`[ProductSync:Delete] Mapping missing for SKUs ${skus.join(', ')}. Falling back to Shopify search.`);
        const found = await findTargetProductBySku(targetStore.shopDomain, skus[0]);
        if (found) {
          targetProductId = found.productId;
          console.log(`[ProductSync:Delete] Found target product ${targetProductId} via live Shopify SKU search.`);
        }
      }

      if (!targetProductId) {
        console.log(`[ProductSync:Delete] No matching product found in target store ${targetStore.shopDomain} for delete. Safe to skip as garbage collection will handle any orphaned cache.`);
        continue;
      }

      // Ensure targetProductId has gid:// prefix for Shopify API
      if (typeof targetProductId === 'string' && !targetProductId.startsWith('gid://')) {
        targetProductId = `gid://shopify/Product/${targetProductId}`;
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
          if (targetMappingId) {
             await prisma.productMapping.delete({ where: { id: targetMappingId }});
             console.log(`[ProductSync:Delete] Deleted target ProductMapping for ${targetStore.shopDomain}.`);
          }
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

    if (masterMapping) {
      await prisma.productMapping.delete({ where: { id: masterMapping.id } });
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