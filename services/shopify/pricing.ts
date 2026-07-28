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
} from './graphql';
import { syncProductCollectionsByTags } from './collection-sync';

export function calculateAdjustedPrice(sourcePriceStr: string, sourceStore: any, targetStore: any): string {
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