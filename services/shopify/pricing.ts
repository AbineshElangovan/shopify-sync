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

export async function calculateAdjustedPrice(
  sourcePriceStr: string, 
  sourceStore: any, 
  targetStore: any,
  productCollections: string[] = []
): Promise<string> {
  const sourcePrice = parseFloat(sourcePriceStr || "0");
  if (isNaN(sourcePrice)) return sourcePriceStr;

  // 1. Calculate Base Price (Reverse source adjustment)
  let basePrice = sourcePrice;
  
  // Find applicable collection rules for SOURCE store to reverse them
  const sourceRules = await prisma.collectionPriceAdjustment.findMany({
    where: {
      storeId: sourceStore?.id,
      enabled: true,
      collection: { title: { in: productCollections } }
    },
    include: { collection: true }
  });

  if (sourceRules.length > 0) {
    if (sourceRules.length > 1) {
      console.warn(`[Pricing] Source store ${sourceStore?.shopDomain} has multiple conflicting collection rules for product. Falling back to Store rule.`);
      if (sourceStore && sourceStore.isPriceAdjustmentEnabled) {
        const value = sourceStore.priceAdjustmentValue || 0;
        if (sourceStore.priceAdjustmentType === 'PERCENTAGE' && value !== -100) {
          basePrice = sourcePrice / (1 + value / 100);
        } else if (sourceStore.priceAdjustmentType === 'FIXED') {
          basePrice = sourcePrice - value;
        }
      }
    } else {
      const rule = sourceRules[0];
      if (rule.adjustmentType === 'PERCENTAGE' && rule.adjustmentValue !== -100) {
        basePrice = sourcePrice / (1 + rule.adjustmentValue / 100);
      } else if (rule.adjustmentType === 'FIXED') {
        basePrice = sourcePrice - rule.adjustmentValue;
      }
    }
  } else {
    // Fallback to source store rule
    if (sourceStore && sourceStore.isPriceAdjustmentEnabled) {
      const value = sourceStore.priceAdjustmentValue || 0;
      if (sourceStore.priceAdjustmentType === 'PERCENTAGE' && value !== -100) {
        basePrice = sourcePrice / (1 + value / 100);
      } else if (sourceStore.priceAdjustmentType === 'FIXED') {
        basePrice = sourcePrice - value;
      }
    }
  }

  // 2. Apply Target Adjustment
  let adjusted = basePrice;
  
  const targetRules = await prisma.collectionPriceAdjustment.findMany({
    where: {
      storeId: targetStore?.id,
      enabled: true,
      collection: { title: { in: productCollections } }
    },
    include: { collection: true }
  });

  if (targetRules.length > 0) {
    if (targetRules.length > 1) {
      // Sort to prioritize the highest adjustment value
      targetRules.sort((a, b) => b.adjustmentValue - a.adjustmentValue);
      console.warn(`[Pricing] Target store ${targetStore?.shopDomain} has multiple conflicting collection rules for product. Picking the highest: ${targetRules[0].collection.title}`);
    }
    
    const rule = targetRules[0];
    console.log(`[Pricing] Applying Collection Rule for ${rule.collection.title}: ${rule.adjustmentType} ${rule.adjustmentValue}`);
    if (rule.adjustmentType === 'PERCENTAGE') {
      adjusted = basePrice * (1 + rule.adjustmentValue / 100);
    } else if (rule.adjustmentType === 'FIXED') {
      adjusted = basePrice + rule.adjustmentValue;
    }
  } else {
    // Fallback to target store rule
    if (targetStore && targetStore.isPriceAdjustmentEnabled) {
      const value = targetStore.priceAdjustmentValue || 0;
      if (targetStore.priceAdjustmentType === 'PERCENTAGE') {
        adjusted = basePrice * (1 + value / 100);
      } else if (targetStore.priceAdjustmentType === 'FIXED') {
        adjusted = basePrice + value;
      }
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

      // Get collections for this product cache
      const productCollections = await prisma.collectionProduct.findMany({
        where: { productCacheId: sourceCache.id },
        include: { collection: true }
      });
      const collectionTitles = productCollections.map(pc => pc.collection.title);

      const newPriceStr = await calculateAdjustedPrice(sourceCache.price.toString(), sourceStore, targetStore, collectionTitles);
      const newPrice = parseFloat(newPriceStr);

      variantsUpdateInput.push({
        id: map.shopifyVariantId,
        price: newPriceStr
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