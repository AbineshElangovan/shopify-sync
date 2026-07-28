import { prisma } from '@/lib/db/prisma';
import { getAdminClient } from '@/lib/shopify/admin';
import { GET_PRODUCT_COLLECTIONS_QUERY } from '@/services/shopify/graphql';
import { syncProductCollectionsByTags } from '@/services/shopify/collection-sync';
import { findTargetProductBySku } from '@/services/shopify/api-helpers';

export async function updateLocalProductCache(shopDomain: string, payload: any, topic?: string) {
  try {
    const store = await prisma.store.findUnique({
      where: { shopDomain },
    });

    if (!store) return;

    const shopifyProductId = `gid://shopify/Product/${payload.id}`;

    if (!store.isActive) {
      console.log(`[ProductSync:Cache] Store ${shopDomain} not found or inactive. Skipping cache update.`);
      return;
    }

    const variants = payload.variants || [];
    console.log(`[ProductSync:Cache] Processing ${variants.length} variants for ${shopDomain}`);
    const syncedVariantIds: string[] = [];

    for (const variant of variants) {
      console.log(`[ProductSync:Cache] Variant ID: ${variant.id}, SKU: ${variant.sku}`);
      
      const fullTitle = variant.title && variant.title !== 'Default Title' 
        ? `${payload.title} - ${variant.title}` 
        : payload.title;
        
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

      const newImageUrl = payload.image?.src || payload.images?.[0]?.src || null;

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

      let finalSku = sku;
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
            imageUrl: newImageUrl,
            inventoryQuantity: trueInventory,
            price: parsedPrice,
          }
        });
      } else {
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
    }

    if (variants.length > 0) {
      const staleCaches = await prisma.productCache.findMany({
        where: {
          storeId: store.id,
          shopifyProductId,
          shopifyVariantId: { notIn: syncedVariantIds },
        },
        select: { id: true }
      });
      for (const sc of staleCaches) {
        await prisma.collectionProduct.deleteMany({ where: { productCacheId: sc.id } });
      }

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
    console.error(`[ProductSync:Cache] Failed to update local cache for ${shopDomain}:`, error.message);
  }
}