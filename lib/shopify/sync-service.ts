import { prisma } from '@/lib/db/prisma';
import { createSyncLog } from './sync-log';
import { setInventoryQuantity } from './inventory';
import { shopify } from '@/lib/shopify';
import { Session } from '@shopify/shopify-api';

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

  const response = await client.request(`
    query getProducts($first: Int!) {
      products(first: $first) {
        edges {
          node {
            id
            title
            handle
            variants(first: 10) {
              edges {
                node {
                  id
                  title
                  sku
                  inventoryItem {
                    id
                    inventoryLevels(first: 5) {
                      edges {
                        node {
                          available
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  `, { variables: { first: 250 } });

  const products = response?.data?.products?.edges ?? [];

  await prisma.variantMap.deleteMany({ where: { storeId: store.id } });
  await prisma.productCache.deleteMany({ where: { storeId: store.id } });

  for (const edge of products) {
    const product = edge.node;
    const variants = product.variants?.edges ?? [];

    for (const variantEdge of variants) {
      const variant = variantEdge.node;
      const inventoryItemId = variant.inventoryItem?.id ?? null;
      const inventoryQuantity = (variant.inventoryItem?.inventoryLevels?.edges ?? []).reduce(
        (sum: number, levelEdge: any) => sum + (Number(levelEdge.node?.available) || 0),
        0,
      );

      await prisma.productCache.create({
        data: {
          storeId: store.id,
          shopifyProductId: product.id,
          shopifyVariantId: variant.id,
          sku: variant.sku?.trim() || null,
          title: `${product.title}${variant.title && variant.title !== 'Default Title' ? ` - ${variant.title}` : ''}`,
          imageUrl: null,
          inventoryQuantity,
        },
      });

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
      console.log(`Source store ${shopDomain} not found or inactive. Skipping sync.`);
      return;
    }

    // Convert inventoryItemId to standard gid format if it's not already
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
      console.log(`No variant map found for inventory item ${gidInventoryItemId} in store ${shopDomain}. Skipping sync.`);
      return;
    }

    const { sku } = sourceVariantMap;

    // Find all other stores that have this SKU
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
      console.log(`No target stores found for SKU ${sku}. Skipping sync.`);
      return;
    }

    // Sync to all target stores
    for (const target of targetVariantMaps) {
      if (!target.store.isActive) continue;

      let syncStatus: 'SUCCESS' | 'FAILED' = 'SUCCESS';
      let failureReason = '';

      try {
        // If we don't have the target's locationId, we might need to fetch it first.
        // For simplicity, we assume we either have it in VariantMap, or we use a default primary location.
        // We'll require target.locationId to be set during initial sync mapping for reliable updates.
        if (!target.locationId) {
          throw new Error('Target location ID not mapped for this variant.');
        }

        await setInventoryQuantity(
          target.store.shopDomain,
          target.inventoryItemId,
          target.locationId,
          availableQuantity
        );

        console.log(`Successfully synced SKU ${sku} to ${target.store.shopDomain} with quantity ${availableQuantity}`);
      } catch (error: any) {
        syncStatus = 'FAILED';
        failureReason = error.message || 'Unknown error during synchronization';
        console.error(`Failed to sync SKU ${sku} to ${target.store.shopDomain}:`, error);
      }

      // Log the sync attempt
      await createSyncLog({
        sku,
        sourceStoreId: sourceStore.id,
        destinationStoreId: target.store.id,
        previousQuantity: 0, // We might not know the exact previous quantity at destination
        updatedQuantity: availableQuantity,
        status: syncStatus,
        failureReason: failureReason || undefined,
        webhookEventId: webhookId,
      });
    }

  } catch (error) {
    console.error(`Fatal error in processInventoryUpdate for ${shopDomain}:`, error);
    throw error;
  }
}
