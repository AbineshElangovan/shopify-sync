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

