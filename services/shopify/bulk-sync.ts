import { prisma } from "@/lib/db/prisma";
import { getAdminClient } from "@/lib/shopify/admin";
import { Session } from "@shopify/shopify-api";
import { shopify } from "@/lib/shopify";
import { ShopifyGraphQLClient } from "@/lib/shopify/GraphQLClient";
import { hasValidShopifyAccessToken } from "./utils";
import { GET_PRODUCTS_QUERY, GET_PRODUCTS_WITH_INVENTORY_QUERY, SHOP_INFO_QUERY } from "./graphql";

export async function syncStoreProducts(shopDomain: string) {
  console.log("[SyncService] Starting sync for shop:", shopDomain);

  const store = await prisma.store.findUnique({
    where: { shopDomain },
  });

  if (!store || !store.isActive) {
    throw new Error(`Store ${shopDomain} is not active or not found.`);
  }

  if (!hasValidShopifyAccessToken(store.accessToken)) {
    console.log("[SyncService] Invalid access token, marking store as inactive:", shopDomain);
    await prisma.variantMap.deleteMany({ where: { storeId: store.id } });
    await prisma.productCache.deleteMany({ where: { storeId: store.id } });
    await prisma.store.update({
      where: { id: store.id },
      data: { isActive: false },
    });
    throw new Error(`Store ${shopDomain} does not have a valid Shopify access token.`);
  }

  const client = await getAdminClient(shopDomain);

  let hasNextPage = true;
  let cursor: string | null = null;
  const syncedVariantIds: string[] = [];
  const syncedCollectionIds: string[] = [];
  let productCount = 0;
  let variantCount = 0;

  while (hasNextPage) {
    const variables: any = { first: 50 };
    if (cursor) {
      variables.after = cursor;
    }

    const response = await client.request(GET_PRODUCTS_QUERY, { variables });
    const productEdges = response?.data?.products?.edges ?? [];
    const pageInfo = response?.data?.products?.pageInfo;

    console.log(`[SyncService] Fetched ${productEdges.length} products on page.`);

    for (const edge of productEdges) {
      const product = edge.node;
      productCount++;

      const productCollectionDbIds: string[] = [];
      const collections = product.collections?.edges ?? [];
      for (const colEdge of collections) {
        const col = colEdge.node;
        syncedCollectionIds.push(col.id);

        const dbCol = await prisma.collection.upsert({
          where: {
            storeId_shopifyCollectionId: {
              storeId: store.id,
              shopifyCollectionId: col.id,
            },
          },
          update: {
            title: col.title,
            handle: col.handle,
          },
          create: {
            storeId: store.id,
            shopifyCollectionId: col.id,
            title: col.title,
            handle: col.handle,
          },
        });
        productCollectionDbIds.push(dbCol.id);
      }

      const variants = product.variants?.edges ?? [];

      for (const variantEdge of variants) {
        const variant = variantEdge.node;
        variantCount++;
        const inventoryItemId = variant.inventoryItem?.id ?? '';
        const inventoryQuantity = (variant.inventoryItem?.inventoryLevels?.edges ?? []).reduce(
          (sum: number, levelEdge: any) => {
            const qtyNode = levelEdge.node?.quantities?.find((q: any) => q.name === "available");
            return sum + (qtyNode?.quantity ?? 0);
          },
          0,
        );
        const locationId = variant.inventoryItem?.inventoryLevels?.edges?.[0]?.node?.location?.id || null;

        const variantTitle = variant.title && variant.title !== 'Default Title' ? ` - ${variant.title}` : '';
        const fullTitle = `${product.title}${variantTitle}`;
        const sku = variant.sku?.trim() || null;
        const imageUrl = product.featuredImage?.url || null;

        syncedVariantIds.push(variant.id);

        console.log(`[SyncService] Upserting ProductCache for SKU: ${sku}, Variant ID: ${variant.id}, Qty: ${inventoryQuantity}`);
        const dbProduct = await prisma.productCache.upsert({
          where: {
            storeId_shopifyVariantId: {
              storeId: store.id,
              shopifyVariantId: variant.id,
            },
          },
          update: {
            sku,
            title: fullTitle,
            imageUrl,
            inventoryQuantity,
            shopifyProductId: product.id,
            price: parseFloat(variant.price || "0"),
          },
          create: {
            storeId: store.id,
            shopifyProductId: product.id,
            shopifyVariantId: variant.id,
            sku,
            title: fullTitle,
            imageUrl,
            inventoryQuantity,
            price: parseFloat(variant.price || "0"),
          },
        });

        for (const collectionDbId of productCollectionDbIds) {
          await prisma.collectionProduct.upsert({
            where: {
              collectionId_productCacheId: {
                collectionId: collectionDbId,
                productCacheId: dbProduct.id,
              },
            },
            update: {},
            create: {
              collectionId: collectionDbId,
              productCacheId: dbProduct.id,
            },
          });
        }

        await prisma.collectionProduct.deleteMany({
          where: {
            productCacheId: dbProduct.id,
            collectionId: { notIn: productCollectionDbIds },
          },
        });

        console.log(`[SyncService] Upserting VariantMap for SKU: ${sku}, Inventory Item ID: ${inventoryItemId}`);
        await prisma.variantMap.upsert({
          where: {
            storeId_shopifyVariantId: {
              storeId: store.id,
              shopifyVariantId: variant.id,
            },
          },
          update: {
            sku: sku || '',
            shopifyProductId: product.id,
            inventoryItemId,
            locationId,
          },
          create: {
            storeId: store.id,
            sku: sku || '',
            shopifyProductId: product.id,
            shopifyVariantId: variant.id,
            inventoryItemId,
            locationId,
          },
        });
      }
    }

    hasNextPage = pageInfo?.hasNextPage ?? false;
    cursor = pageInfo?.endCursor ?? null;
  }

  const deletedCache = await prisma.productCache.deleteMany({
    where: {
      storeId: store.id,
      shopifyVariantId: { notIn: syncedVariantIds },
    },
  });

  const deletedMaps = await prisma.variantMap.deleteMany({
    where: {
      storeId: store.id,
      shopifyVariantId: { notIn: syncedVariantIds },
    },
  });

  const deletedCollections = await prisma.collection.deleteMany({
    where: {
      storeId: store.id,
      shopifyCollectionId: { notIn: syncedCollectionIds },
    },
  });

  console.log("[SyncService] Sync finished. Cleaned up stale records:", {
    deletedProducts: deletedCache.count,
    deletedVariantMaps: deletedMaps.count,
    deletedCollections: deletedCollections.count,
    syncedProducts: productCount,
    syncedVariants: variantCount
  });

  return {
    syncedProducts: productCount,
    syncedVariants: variantCount,
  };
}

export async function syncStoreA(shopDomain: string) {
  const normalizedShop = shopDomain.trim().toLowerCase();
  console.log(`[SyncStoreA] Starting sync for ${normalizedShop}`);

  const client = new ShopifyGraphQLClient(normalizedShop);

  const shopQuery = SHOP_INFO_QUERY;
  const shopResult = await client.request<{ data: { shop: any } }>(shopQuery);
  const shopInfo = shopResult.data?.shop;

  if (!shopInfo) {
    throw new Error("Could not fetch shop information from Shopify API");
  }

  console.log(`[SyncStoreA] Fetched shop name: ${shopInfo.name}`);

  const store = await prisma.store.upsert({
    where: { shopDomain: normalizedShop },
    update: {
      label: shopInfo.name,
      isActive: true,
    },
    create: {
      shopDomain: normalizedShop,
      accessToken: "", 
      scope: "",
      label: shopInfo.name,
      isActive: true,
    },
  });

  const productsQuery = GET_PRODUCTS_WITH_INVENTORY_QUERY;

  const productsResult = await client.request<{ data: { products: { edges: any[] } } }>(
    productsQuery,
    { first: 50 }
  );

  const productEdges = productsResult.data?.products?.edges ?? [];
  console.log(`[SyncStoreA] Fetched ${productEdges.length} products`);

  let syncedProductsCount = 0;
  let syncedVariantsCount = 0;
  let totalInventoryCount = 0;

  for (const productEdge of productEdges) {
    const product = productEdge.node;
    syncedProductsCount++;

    const variants = product.variants?.edges ?? [];
    for (const variantEdge of variants) {
      const variant = variantEdge.node;
      syncedVariantsCount++;

      const inventoryItemId = variant.inventoryItem?.id ?? "";
      const levels = variant.inventoryItem?.inventoryLevels?.edges ?? [];

      const variantInventoryQuantity = levels.reduce(
        (sum: number, levelEdge: any) => {
          const qtyNode = levelEdge.node?.quantities?.find((q: any) => q.name === "available");
          return sum + (qtyNode?.quantity ?? 0);
        },
        0
      );
      totalInventoryCount += variantInventoryQuantity;

      const locationId = levels[0]?.node?.location?.id || null;
      const sku = variant.sku?.trim() || null;
      const imageUrl = product.featuredImage?.url || null;

      const variantSuffix = variant.title && variant.title !== "Default Title" ? ` - ${variant.title}` : "";
      const fullTitle = `${product.title}${variantSuffix}`;

      await prisma.productCache.upsert({
        where: {
          storeId_shopifyVariantId: {
            storeId: store.id,
            shopifyVariantId: variant.id,
          },
        },
        update: {
          sku,
          title: fullTitle,
          imageUrl,
          inventoryQuantity: variantInventoryQuantity,
          shopifyProductId: product.id,
          price: parseFloat(variant.price || "0"),
        },
        create: {
          storeId: store.id,
          shopifyProductId: product.id,
          shopifyVariantId: variant.id,
          sku,
          title: fullTitle,
          imageUrl,
          inventoryQuantity: variantInventoryQuantity,
          price: parseFloat(variant.price || "0"),
        },
      });

      await prisma.variantMap.upsert({
        where: {
          storeId_shopifyVariantId: {
            storeId: store.id,
            shopifyVariantId: variant.id,
          },
        },
        update: {
          sku: sku || "",
          shopifyProductId: product.id,
          inventoryItemId,
          locationId,
        },
        create: {
          storeId: store.id,
          sku: sku || "",
          shopifyProductId: product.id,
          shopifyVariantId: variant.id,
          inventoryItemId,
          locationId,
        },
      });
    }
  }

  console.log(`[SyncStoreA] Sync completed for ${normalizedShop}:`, {
    products: syncedProductsCount,
    variants: syncedVariantsCount,
    inventory: totalInventoryCount,
  });

  return {
    shop: normalizedShop,
    products: syncedProductsCount,
    variants: syncedVariantsCount,
    inventory: totalInventoryCount,
  };
}
