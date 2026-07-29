import { prisma } from '@/lib/db/prisma';
import { createSyncLog } from './sync-log';
import { setInventoryQuantity } from './inventory';
import { shopify } from '@/lib/shopify';
import { Session } from '@shopify/shopify-api';
import {
  GET_PRODUCTS_SYNC_QUERY,
  GET_COLLECTIONS_QUERY,
  GET_COLLECTION_PRODUCTS_QUERY,
} from '@/services/shopify/graphql';

export function hasValidShopifyAccessToken(token: string | null | undefined): boolean {
  if (!token) return false;

  const normalized = token.trim();
  if (!normalized) return false;
  if (/mock|placeholder|your[_-]?token|seed/i.test(normalized)) return false;

  return normalized.startsWith('shp');
}

export async function cleanupSeededData() {
  const seededStoreIds = await prisma.store.findMany({
    where: {
      OR: [
        { shopDomain: { contains: 'mock', mode: 'insensitive' } },
        { shopDomain: { contains: 'seed', mode: 'insensitive' } },
        { accessToken: { contains: 'mock', mode: 'insensitive' } },
        { accessToken: { contains: 'placeholder', mode: 'insensitive' } },
        { accessToken: { contains: 'your_', mode: 'insensitive' } },
        { accessToken: { contains: 'your-', mode: 'insensitive' } },
      ],
    },
    select: { id: true },
  });

  if (seededStoreIds.length > 0) {
    const seededStoreIdList = seededStoreIds.map((store) => store.id);

    await prisma.syncLog.deleteMany({
      where: {
        OR: [
          { sourceStoreId: { in: seededStoreIdList } },
          { destinationStoreId: { in: seededStoreIdList } },
        ],
      },
    });

    await prisma.variantMap.deleteMany({
      where: {
        storeId: { in: seededStoreIdList },
      },
    });

    await prisma.productCache.deleteMany({
      where: {
        storeId: { in: seededStoreIdList },
      },
    });

    await prisma.store.deleteMany({
      where: {
        id: { in: seededStoreIdList },
      },
    });
  }

  await prisma.syncLog.deleteMany({
    where: {
      OR: [
        { sourceStoreId: { in: [] } },
        { destinationStoreId: { in: [] } },
      ],
    },
  });

  await prisma.store.deleteMany({
    where: {
      OR: [
        { shopDomain: { contains: 'mock', mode: 'insensitive' } },
        { shopDomain: { contains: 'seed', mode: 'insensitive' } },
        { accessToken: { contains: 'mock', mode: 'insensitive' } },
        { accessToken: { contains: 'placeholder', mode: 'insensitive' } },
        { accessToken: { contains: 'your_', mode: 'insensitive' } },
        { accessToken: { contains: 'your-', mode: 'insensitive' } },
      ],
    },
  });
}

export async function syncStoreProducts(shopDomain: string) {
  console.log("[Sync] syncStoreProducts start", { shopDomain });

  const store = await prisma.store.findUnique({
    where: { shopDomain },
  });

  console.log("[Sync] store lookup result", {
    shopDomain,
    found: Boolean(store),
    active: store?.isActive,
    hasToken: Boolean(store?.accessToken),
  });

  if (!store || !store.isActive) {
    throw new Error(`Store ${shopDomain} is not active or not found.`);
  }

  if (!hasValidShopifyAccessToken(store.accessToken)) {
    console.log("[Sync] invalid access token detected", { shopDomain });
    await prisma.variantMap.deleteMany({ where: { storeId: store.id } });
    await prisma.productCache.deleteMany({ where: { storeId: store.id } });
    await prisma.store.update({
      where: { id: store.id },
      data: { isActive: false },
    });
    throw new Error(`Store ${shopDomain} does not have a valid Shopify access token.`);
  }

  const session = new Session({
    id: `offline_${shopDomain}`,
    shop: shopDomain,
    state: 'offline',
    isOnline: false,
    accessToken: store.accessToken,
  });

  const client = new shopify.clients.Graphql({ session });

  let products = [];
  try {
    const response = await client.request(GET_PRODUCTS_SYNC_QUERY, { variables: { first: 250 } });
    products = response?.data?.products?.edges ?? [];
    console.log(`[SyncService] Fetched ${products.length} products to sync.`);
  } catch (error: any) {
    if (error.message?.includes('Forbidden')) {
      console.log(`[SyncService] 403 Forbidden for ${shopDomain}. Disabling store.`);
      await prisma.store.update({ where: { id: store.id }, data: { isActive: false } });
      return { syncedProducts: 0, syncedVariants: 0, error: 'Store token forbidden' };
    }
    throw error;
  }

  await prisma.collection.deleteMany({ where: { storeId: store.id } });
  await prisma.variantMap.deleteMany({ where: { storeId: store.id } });
  await prisma.productCache.deleteMany({ where: { storeId: store.id } });

  const shopifyProductToCacheIds = new Map<string, string[]>();

  for (const edge of products) {
    const product = edge.node;
    const variants = product.variants?.edges ?? [];

    for (const variantEdge of variants) {
      const variant = variantEdge.node;
      const inventoryItemId = variant.inventoryItem?.id ?? null;
      const inventoryQuantity = (variant.inventoryItem?.inventoryLevels?.edges ?? []).reduce(
        (sum: number, levelEdge: any) => {
          const qtyNode = levelEdge.node?.quantities?.find((q: any) => q.name === "available");
          return sum + (qtyNode?.quantity ?? 0);
        },
        0,
      );

      const productImageUrl = product.images?.edges?.[0]?.node?.url || null;

      console.log(`[SyncService] Creating ProductCache for SKU: ${variant.sku}, Variant ID: ${variant.id}, Qty: ${inventoryQuantity}`);
      const cacheRecord = await prisma.productCache.create({
        data: {
          storeId: store.id,
          shopifyProductId: product.id,
          shopifyVariantId: variant.id,
          sku: variant.sku?.trim() || null,
          title: `${product.title}${variant.title && variant.title !== 'Default Title' ? ` - ${variant.title}` : ''}`,
          imageUrl: productImageUrl,
          inventoryQuantity,
          price: parseFloat(variant.price || "0"),
        },
      });

      if (!shopifyProductToCacheIds.has(product.id)) {
        shopifyProductToCacheIds.set(product.id, []);
      }
      shopifyProductToCacheIds.get(product.id)!.push(cacheRecord.id);

      console.log(`[SyncService] Creating VariantMap for SKU: ${variant.sku}, Inventory Item ID: ${inventoryItemId}`);
      await prisma.variantMap.create({
        data: {
          storeId: store.id,
          sku: variant.sku?.trim() || '',
          shopifyProductId: product.id,
          shopifyVariantId: variant.id,
          inventoryItemId: inventoryItemId || '',
          locationId: null,
        },
      });
    }
  }

  // Fetch Collections
  const collectionsResponse: any = await client.request(GET_COLLECTIONS_QUERY, { variables: { first: 250 } });

  const collections = collectionsResponse?.data?.collections?.edges ?? [];
  console.log(`[SyncService] Fetched ${collections.length} collections for store ${shopDomain}`);

  for (const colEdge of collections) {
    const colNode = colEdge.node;
    
    // Save Collection
    const dbCollection = await prisma.collection.create({
      data: {
        storeId: store.id,
        shopifyCollectionId: colNode.id,
        title: colNode.title,
        handle: colNode.handle,
      },
    });

    // Fetch Products for each Collection
    const collectionProductsResponse: any = await client.request(GET_COLLECTION_PRODUCTS_QUERY, { variables: { id: colNode.id, first: 250 } });

    const colProducts = collectionProductsResponse?.data?.collection?.products?.edges ?? [];
    
    for (const prodEdge of colProducts) {
      const shopifyProductId = prodEdge.node.id;
      const cacheIds = shopifyProductToCacheIds.get(shopifyProductId) ?? [];
      
      // Save Product Mapping
      for (const cacheId of cacheIds) {
        await prisma.collectionProduct.create({
          data: {
            collectionId: dbCollection.id,
            productCacheId: cacheId,
          },
        });
      }
    }
  }

  return {
    syncedProducts: products.length,
    syncedVariants: products.reduce((count: number, edge: any) => count + (edge.node.variants?.edges?.length ?? 0), 0),
  };
}

export async function processInventoryUpdate(
  shopDomain: string,
  inventoryItemId: string,
  locationId: string,
  availableQuantity: number,
  webhookId?: string
) {
  try {
    const sourceStore = await prisma.store.findUnique({
      where: { shopDomain },
    });

    if (!sourceStore || !sourceStore.isActive) {
      console.log(`[SyncService] Source store ${shopDomain} not found or inactive. Skipping.`);
      return;
    }

    const gidInventoryItemId = inventoryItemId.includes('gid://')
      ? inventoryItemId
      : `gid://shopify/InventoryItem/${inventoryItemId}`;

    // Find the variant map in the source store
    const sourceVariantMap = await prisma.variantMap.findFirst({
      where: {
        storeId: sourceStore.id,
        inventoryItemId: gidInventoryItemId,
      },
    });

    if (!sourceVariantMap) {
      console.log(`[SyncService] No variant map found for inventory item ${gidInventoryItemId} in store ${shopDomain}. Skipping.`);
      return;
    }

    const { sku, shopifyProductId, shopifyVariantId } = sourceVariantMap;

    // Fetch the previous cached inventory quantity for the source store to calculate delta
    const sourceCachedProduct = await prisma.productCache.findFirst({
      where: {
        storeId: sourceStore.id,
        shopifyVariantId,
      },
    });

    const previousQuantity = sourceCachedProduct ? sourceCachedProduct.inventoryQuantity : availableQuantity;
    const delta = availableQuantity - previousQuantity;

    // Update local productCache inventory quantity for the source store variant
    if (delta !== 0) {
      await prisma.productCache.updateMany({
        where: {
          storeId: sourceStore.id,
          shopifyVariantId,
        },
        data: {
          inventoryQuantity: availableQuantity,
        },
      });
    }

    if (!sourceStore.autoSyncEnabled) {
      console.log(`[SyncService] Auto-sync is disabled for source store ${shopDomain}. Skipping target replication.`);
      return;
    }

    if (delta === 0) {
      console.log(`[SyncService] Delta is 0 for SKU ${sku} in store ${shopDomain}. Skipping target replication.`);
      return;
    }

    if (!sku) {
      console.log(`[SyncService] Variant ${shopifyVariantId} has no SKU. Skipping target replication.`);
      return;
    }

    // Find all other stores mapping this same SKU
    const targetVariantMaps = await prisma.variantMap.findMany({
      where: {
        sku,
        storeId: { not: sourceStore.id },
      },
      include: {
        store: true,
      },
    });

    if (targetVariantMaps.length === 0) {
      console.log(`[SyncService] SKU ${sku} is not mapped in any other stores. Finished.`);
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

      // Get target's current cached inventory quantity to calculate targetNewQuantity
      const targetCachedProduct = await prisma.productCache.findFirst({
        where: {
          storeId: target.store.id,
          shopifyVariantId: target.shopifyVariantId,
        },
      });

      const targetPrevQuantity = targetCachedProduct ? targetCachedProduct.inventoryQuantity : 0;
      const targetNewQuantity = Math.max(0, targetPrevQuantity + delta);

      try {
        if (!target.locationId) {
          throw new Error('Target location ID not mapped for this variant.');
        }

        // Set remote inventory in Shopify
        await setInventoryQuantity(
          target.store.shopDomain,
          target.inventoryItemId,
          target.locationId,
          targetNewQuantity
        );

        // Update local cache count for target store
        await prisma.productCache.updateMany({
          where: {
            storeId: target.store.id,
            shopifyVariantId: target.shopifyVariantId,
          },
          data: {
            inventoryQuantity: targetNewQuantity,
          },
        });

        console.log(`[SyncService] Delta-synced SKU ${sku} to ${target.store.shopDomain}: ${targetPrevQuantity} -> ${targetNewQuantity} (delta: ${delta})`);
      } catch (error: any) {
        syncStatus = 'FAILED';
        failureReason = error.message || 'Unknown error';
        console.error(`[SyncService] Failed to sync SKU ${sku} to ${target.store.shopDomain}:`, error.message);
      }

      // Log sync history
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
    }
  } catch (error: any) {
    console.error(`[SyncService] processInventoryUpdate error:`, error.message);
    throw error;
  }
}
