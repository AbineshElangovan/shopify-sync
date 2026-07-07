import { shopify } from "@/lib/shopify";
import { prisma } from "@/lib/db/prisma";
import { Session, GraphqlQueryError } from "@shopify/shopify-api";
import { registerWebhooks } from "@/lib/shopify/webhooks";
import { createSyncLog } from "@/lib/shopify/sync-log";
import { NextRequest, NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { ShopifyGraphQLClient } from "@/lib/shopify/GraphQLClient";

export function hasValidShopifyAccessToken(token: string | null | undefined): boolean {
  if (!token) return false;
  const normalized = token.trim();
  if (!normalized) return false;
  if (/mock|placeholder|your[_-]?token|seed/i.test(normalized)) return false;
  return normalized.startsWith('shp');
}
export async function cleanupSeededData() {
  try {
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
        where: { storeId: { in: seededStoreIdList } },
      });

      await prisma.productCache.deleteMany({
        where: { storeId: { in: seededStoreIdList } },
      });

      await prisma.store.deleteMany({
        where: { id: { in: seededStoreIdList } },
      });
    }

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
  } catch (error: any) {
    console.error("[Service:cleanupSeededData] Error cleaning up seeded data:", error.message);
  }
}

export async function beginAuth(shop: string, rawRequest: NextRequest) {
  const sanitizedShop = shopify.utils.sanitizeShop(shop, true);
  if (!sanitizedShop) {
    throw new Error("Invalid shop domain");
  }

  const hostName = shopify.config.hostName;
  const secureUrl = `https://${hostName}${rawRequest.nextUrl.pathname}${rawRequest.nextUrl.search}`;
  console.log("[OAuth] beginAuth creating secure cleanRequest:", { secureUrl, hostName });
  const cleanRequest = new Request(secureUrl, {
    method: rawRequest.method,
    headers: rawRequest.headers,
  });

  return await shopify.auth.begin({
    shop: sanitizedShop,
    callbackPath: "/api/auth/callback",
    isOnline: false,
    rawRequest: cleanRequest,
  });
}

export async function handleAuthCallback(req: NextRequest) {
  console.log("[OAuth] callback start in Service", { shop: req.nextUrl.searchParams.get("shop") });

  const hostName = shopify.config.hostName;
  const secureUrl = `https://${hostName}${req.nextUrl.pathname}${req.nextUrl.search}`;
  console.log("[OAuth] handleAuthCallback creating secure cleanRequest:", { secureUrl });
  const cleanRequest = new Request(secureUrl, {
    method: req.method,
    headers: req.headers,
  });

  console.log("[OAuthCallback] Validating auth callback...");
  const callbackResponse = await shopify.auth.callback({
    rawRequest: cleanRequest,
  });
  console.log("[OAuthCallback] OAuth validation succeeded.");

  const { session, headers } = callbackResponse;
  const { shop, accessToken, scope } = session;

  const maskedToken = accessToken
    ? `${accessToken.substring(0, 10)}...${accessToken.substring(accessToken.length - 4)}`
    : "null";

  console.log("[OAuthCallback] Complete Session Object received:", {
    id: session.id,
    shop: session.shop,
    state: session.state,
    isOnline: session.isOnline,
    scope: session.scope,
    expires: session.expires,
    accessToken: maskedToken,
  });

  if (!accessToken) {
    throw new Error("No access token provided by Shopify");
  }

  console.log("[OAuthCallback] Attempting storeSession...");
  await shopify.config.sessionStorage.storeSession(session);
  console.log("[OAuthCallback] storeSession completed successfully.");

  try {
    const dbSession = await prisma.session.findUnique({ where: { id: session.id } });
    console.log("[DBVerification] Post-write Session check:", {
      exists: Boolean(dbSession),
      storedId: dbSession?.id,
      storedShop: dbSession?.shop,
    });
  } catch (dbErr: any) {
    console.error("[DBVerification] Error querying Session table post-write:", dbErr.message);
  }

  const normalizedShop = shop.trim().toLowerCase();

  await cleanupSeededData();

  let shopLabel = normalizedShop;
  try {
    console.log("[OAuth] Fetching shop details from Shopify GraphQL API for:", normalizedShop);
    const client = new shopify.clients.Graphql({ session });
    const shopResponse: any = await client.request(`
      query {
        shop {
          name
        }
      }
    `);

    if (shopResponse.data?.shop?.name) {
      shopLabel = shopResponse.data.shop.name;
      console.log("[OAuth] Successfully retrieved shop name:", shopLabel);
    } else {
      console.log("[OAuth] Shop query returned empty or missing name. Defaulting label to domain.");
    }
  } catch (error: any) {
    console.error("[OAuth] Failed to fetch shop details from Shopify:", error.message);
    console.log("[OAuth] Falling back to shop domain as label:", normalizedShop);
  }
  console.log("[OAuth] Upserting store record in database for shop:", normalizedShop);
  const storedShop = await prisma.store.upsert({
    where: { shopDomain: normalizedShop },
    update: {
      accessToken: accessToken,
      scope: scope || "",
      isActive: true,
      label: shopLabel,
    },
    create: {
      shopDomain: normalizedShop,
      accessToken: accessToken,
      scope: scope || "",
      isActive: true,
      label: shopLabel,
    },
  });

  console.log("[OAuth] Store record persisted successfully:", {
    id: storedShop.id,
    shopDomain: storedShop.shopDomain,
    label: storedShop.label,
    isActive: storedShop.isActive
  });

  // Post-store database verification
  try {
    const dbStore = await prisma.store.findUnique({ where: { shopDomain: normalizedShop } });
    const storeMaskedToken = dbStore?.accessToken
      ? `${dbStore.accessToken.substring(0, 10)}...${dbStore.accessToken.substring(dbStore.accessToken.length - 4)}`
      : "null";
    console.log("[DBVerification] Post-write Store check:", {
      exists: Boolean(dbStore),
      id: dbStore?.id,
      shopDomain: dbStore?.shopDomain,
      accessTokenSaved: Boolean(dbStore?.accessToken),
      accessTokenMasked: storeMaskedToken,
    });
  } catch (dbErr: any) {
    console.error("[DBVerification] Error querying Store table post-write:", dbErr.message);
  }

  // Register Shopify webhooks
  try {
    await registerWebhooks(session);
    console.log("[OAuth] Webhooks registered successfully");
  } catch (error: any) {
    console.error("[OAuth] Webhook registration failed:", error.message);
  }

  // Trigger product and inventory synchronization in background
  syncStoreProducts(normalizedShop)
    .then((result) => {
      console.log(`[OAuth] Background initial sync complete for ${normalizedShop}`, result);
    })
    .catch((error: any) => {
      console.error(`[OAuth] Background initial sync failed for ${normalizedShop}:`, error.message);
    });

  // Get embedded app URL to redirect the user
  const redirectUrl = await shopify.auth.getEmbeddedAppUrl({
    rawRequest: cleanRequest,
  });

  const response = NextResponse.redirect(redirectUrl);

  if (headers) {
    if (typeof headers.getSetCookie === "function") {
      const setCookies = headers.getSetCookie();
      console.log("[OAuth] handleAuthCallback copying individual cookies:", setCookies);
      setCookies.forEach((cookieStr: string) => {
        response.headers.append("Set-Cookie", cookieStr);
      });
    } else {
      headers.forEach((value: string, key: string) => {
        if (key.toLowerCase() === "set-cookie") {
          console.log("[OAuth] handleAuthCallback copying cookie (fallback):", value);
          response.headers.append(key, value);
        } else {
          response.headers.set(key, value);
        }
      });
    }
  }

  return response;
}

/**
 * Gets offline Shopify GraphQL client.
 */
export async function getAdminClient(shopDomain: string) {
  console.log("[AdminClient] Initializing getAdminClient for shop:", shopDomain);
  const store = await prisma.store.findUnique({
    where: { shopDomain },
  });

  console.log("[AdminClient] Store record query result:", {
    found: Boolean(store),
    isActive: store?.isActive,
    hasAccessToken: Boolean(store?.accessToken),
  });

  if (!store || !store.isActive) {
    throw new Error(`Store ${shopDomain} is not active or not found.`);
  }

  const maskedToken = store.accessToken
    ? `${store.accessToken.substring(0, 10)}...${store.accessToken.substring(store.accessToken.length - 4)}`
    : "null";
  console.log("[AdminClient] Instantiating offline Session with token:", maskedToken);

  const session = new Session({
    id: `offline_${shopDomain}`,
    shop: shopDomain,
    state: "offline",
    isOnline: false,
    accessToken: store.accessToken,
  });

  const client = new shopify.clients.Graphql({ session });
  console.log("[AdminClient] GraphQL client initialized successfully.");
  return client;
}

/**
 * Handles GraphQL response error.
 */
async function handleGraphQLError(error: any, shopDomain: string) {
  if (error instanceof GraphqlQueryError) {
    console.error(`GraphQL Query Error for ${shopDomain}:`, JSON.stringify(error.response, null, 2));
    throw new Error(`Shopify GraphQL Error: ${error.message}`);
  }

  if (error.response?.code === 401 || error.response?.status === 401 || error.statusCode === 401) {
    console.warn(`Access token invalid for ${shopDomain}. Marking store as inactive.`);
    await prisma.store.update({
      where: { shopDomain },
      data: { isActive: false },
    });
    throw new Error(`Unauthorized: Store ${shopDomain} marked as inactive.`);
  }

  throw error;
}

/**
 * Fetches general Shopify shop info.
 */
export async function fetchShopInfo(shopDomain: string) {
  const client = await getAdminClient(shopDomain);
  try {
    const response = await client.request(`
      query {
        shop {
          id
          name
          email
          myshopifyDomain
        }
      }
    `);
    return response.data?.shop;
  } catch (error: any) {
    return handleGraphQLError(error, shopDomain);
  }
}

/**
 * Fetches inventory level for items.
 */
export async function fetchInventoryLevels(shopDomain: string, inventoryItemId: string) {
  const client = await getAdminClient(shopDomain);
  try {
    const response = await client.request(`
      query getInventory($id: ID!) {
        inventoryItem(id: $id) {
          inventoryLevels(first: 10) {
            edges {
              node {
                id
                quantities(names: ["available"]) {
                  name
                  quantity
                }
                location {
                  id
                  name
                }
              }
            }
          }
        }
      }
    `, { variables: { id: inventoryItemId } });
    return response.data?.inventoryItem?.inventoryLevels;
  } catch (error: any) {
    return handleGraphQLError(error, shopDomain);
  }
}

/**
 * Sets inventory level on Shopify.
 */
export async function setInventoryQuantity(
  shopDomain: string,
  inventoryItemId: string,
  locationId: string,
  quantity: number
) {
  const client = await getAdminClient(shopDomain);
  try {
    const response = await client.request(`
      mutation inventorySetQuantities($input: InventorySetQuantitiesInput!) {
        inventorySetQuantities(input: $input) {
          inventoryAdjustmentGroup {
            createdAt
            reason
            changes {
              name
              delta
              quantityAfterChange
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `, {
      variables: {
        input: {
          name: "available",
          reason: "correction",
          ignoreCompareQuantity: true,
          quantities: [
            {
              inventoryItemId,
              locationId,
              quantity
            }
          ]
        }
      }
    });

    const userErrors = response.data?.inventorySetQuantities?.userErrors;
    if (userErrors && userErrors.length > 0) {
      throw new Error(`Failed to set inventory: ${userErrors.map((e: any) => e.message).join(', ')}`);
    }

    return response.data?.inventorySetQuantities?.inventoryAdjustmentGroup;
  } catch (error: any) {
    console.error(`Error setting inventory for ${shopDomain}:`, error.message);
    throw error;
  }
}

/**
 * Fetches product details.
 */
export async function fetchProducts(shopDomain: string, first = 10) {
  const client = await getAdminClient(shopDomain);
  try {
    const response = await client.request(`
      query getProducts($first: Int!) {
        products(first: $first) {
          edges {
            node {
              id
              title
              handle
              updatedAt
              variants(first: 5) {
                edges {
                  node {
                    id
                    title
                    sku
                    price
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
    `, { variables: { first } });
    return response.data?.products;
  } catch (error: any) {
    return handleGraphQLError(error, shopDomain);
  }
}

/**
 * Synchronizes store products and inventory from Shopify using UPSERT to prevent duplicate items.
 */
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
    const query = `
      query getProducts($first: Int!, $after: String) {
        products(first: $first, after: $after) {
          edges {
            node {
              id
              title
              handle
              featuredImage {
                url
              }
              collections(first: 20) {
                edges {
                  node {
                    id
                    title
                    handle
                  }
                }
              }
              variants(first: 50) {
                edges {
                  node {
                    id
                    title
                    sku
                    inventoryItem {
                      id
                      inventoryLevels(first: 10) {
                        edges {
                          node {
                            quantities(names: ["available"]) {
                              name
                              quantity
                            }
                            location {
                              id
                            }
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
    `;

    const variables: any = { first: 50 };
    if (cursor) {
      variables.after = cursor;
    }

    const response = await client.request(query, { variables });
    const productEdges = response?.data?.products?.edges ?? [];
    const pageInfo = response?.data?.products?.pageInfo;

    console.log(`[SyncService] Fetched ${productEdges.length} products on page.`);

    for (const edge of productEdges) {
      const product = edge.node;
      productCount++;

      // Upsert collections and collect their DB IDs
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
        // Perform clean atomic upserts to prevent duplicates while retaining existing database links/ids
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
          },
          create: {
            storeId: store.id,
            shopifyProductId: product.id,
            shopifyVariantId: variant.id,
            sku,
            title: fullTitle,
            imageUrl,
            inventoryQuantity,
          },
        });

        // Map product to its collections
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

        // Remove old collection associations for this variant
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

  // Delete stale variants in the local database that were deleted from Shopify
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

  // Delete stale collections that were deleted from Shopify
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

/**
 * Handles incoming inventory update webhooks and replicates values to other stores mapped by SKU.
 */
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
    await prisma.productCache.updateMany({
      where: {
        storeId: sourceStore.id,
        shopifyVariantId,
      },
      data: {
        inventoryQuantity: availableQuantity,
      },
    });

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

/**
 * Verifies if the store is installed and active; redirects to OAuth if not.
 */
export async function verifyStoreInstallation(shop: string | null | undefined, host: string | null | undefined) {
  if (!shop) return;
  const normalizedShop = shop.trim().toLowerCase();

  const store = await prisma.store.findUnique({
    where: { shopDomain: normalizedShop },
  });

  if (!store || !store.isActive || !hasValidShopifyAccessToken(store.accessToken)) {
    console.log(`[AuthVerify] Store ${normalizedShop} not connected. Redirecting to OAuth.`);
    redirect(`/api/auth?shop=${normalizedShop}&host=${host || ""}&embedded=1`);
  }
}


export async function syncStoreA(shopDomain: string) {
  const normalizedShop = shopDomain.trim().toLowerCase();
  console.log(`[SyncStoreA] Starting sync for ${normalizedShop}`);

  const client = new ShopifyGraphQLClient(normalizedShop);

  // 2. Fetch Shop details
  const shopQuery = `
    query {
      shop {
        id
        name
        email
        myshopifyDomain
      }
    }
  `;
  const shopResult = await client.request<{ data: { shop: any } }>(shopQuery);
  const shopInfo = shopResult.data?.shop;

  if (!shopInfo) {
    throw new Error("Could not fetch shop information from Shopify API");
  }

  console.log(`[SyncStoreA] Fetched shop name: ${shopInfo.name}`);

  // 3. Upsert the Store details in the database to ensure it's up to date
  const store = await prisma.store.upsert({
    where: { shopDomain: normalizedShop },
    update: {
      label: shopInfo.name,
      isActive: true,
    },
    create: {
      shopDomain: normalizedShop,
      accessToken: "", // Assumes it already exists or was set via OAuth callback
      scope: "",
      label: shopInfo.name,
      isActive: true,
    },
  });

  // 4. Fetch Products, Variants, and Inventory Levels
  const productsQuery = `
    query getProducts($first: Int!) {
      products(first: $first) {
        edges {
          node {
            id
            title
            handle
            featuredImage {
              url
            }
            variants(first: 50) {
              edges {
                node {
                  id
                  title
                  sku
                  price
                  inventoryItem {
                    id
                    inventoryLevels(first: 10) {
                      edges {
                        node {
                          quantities(names: ["available"]) {
                            name
                            quantity
                          }
                          location {
                            id
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

  // Fetch a reasonable batch of products for Milestone 1 (e.g. 50 products)
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

      // Calculate total available inventory quantity across all locations
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

      // 5. Save the data to PostgreSQL using Prisma upsert operations
      // Store in ProductCache
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
        },
        create: {
          storeId: store.id,
          shopifyProductId: product.id,
          shopifyVariantId: variant.id,
          sku,
          title: fullTitle,
          imageUrl,
          inventoryQuantity: variantInventoryQuantity,
        },
      });

      // Store in VariantMap
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
