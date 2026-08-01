import { shopify } from "@/lib/shopify";
import { prisma } from "@/lib/db/prisma";
import { Session, GraphqlQueryError } from "@shopify/shopify-api";
import {
  SHOP_INFO_QUERY,
  GET_PRODUCTS_BASIC_QUERY,
  GET_PRODUCT_VARIANTS_QUERY,
  GET_INVENTORY_LEVELS_QUERY,
} from "@/services/shopify/graphql";

export async function getAdminClient(shopDomain: string) {
  console.log("[AdminClient] Initializing getAdminClient for shop:", shopDomain);
  const store = await prisma.store.findUnique({
    where: { shopDomain },
  });

  if (!store || !store.isActive) {
    throw new Error(`Store ${shopDomain} is not active or not found.`);
  }

  // 1. Strict Validation
  if (!store.accessToken || store.accessToken.trim() === "") {
    console.error(`[AdminClient] CRITICAL: Store ${shopDomain} has an empty access token.`);
    throw new Error(`CRITICAL: Store ${shopDomain} has an empty access token.`);
  }

  const maskedToken = `${store.accessToken.substring(0, 10)}...${store.accessToken.substring(store.accessToken.length - 4)}`;
  console.log("[AdminClient] Instantiating offline Session with Store token:", maskedToken);

  console.log("Token starts with:", store.accessToken.substring(0, 20));
  console.log("Token length:", store.accessToken.length);

  // 2. Single Source of Truth
  // We construct an ephemeral Session object solely for the SDK to use.
  // We DO NOT fetch from or write to the Shopify-managed Session table.
  const session = new Session({
    id: `offline_${shopDomain}`,
    shop: shopDomain,
    state: "offline",
    isOnline: false,
    accessToken: store.accessToken,
  });

  const client = new shopify.clients.Graphql({ session: session as Session });
  console.log("[AdminClient] GraphQL client initialized successfully.");
  return client;
}

async function handleGraphQLError(error: any, shopDomain: string) {
  if (error instanceof GraphqlQueryError) {
    console.error(`GraphQL Query Error for ${shopDomain}:`, JSON.stringify(error.response, null, 2));
    throw new Error(`Shopify GraphQL Error: ${error.message}`);
  }


  if (
    error.response?.code === 401 ||
    error.response?.status === 401 ||
    error.statusCode === 401 ||
    error.networkStatusCode === 401 ||
    error.message?.includes("Unauthorized")
  ) {
    console.warn(`Access token invalid for ${shopDomain}. Marking store as inactive.`);
    await prisma.store.update({
      where: { shopDomain },
      data: { isActive: false },
    });
    throw new Error(`Unauthorized: Store ${shopDomain} marked as inactive.`);
  }

  throw error;
}

export async function fetchShopInfo(shopDomain: string) {
  const client = await getAdminClient(shopDomain);

  try {
    const response = await client.request(SHOP_INFO_QUERY);

    return response.data?.shop;
  } catch (error) {
    return handleGraphQLError(error, shopDomain);
  }
}

export async function fetchProducts(shopDomain: string, first = 10) {
  const client = await getAdminClient(shopDomain);

  try {
    const response = await client.request(GET_PRODUCTS_BASIC_QUERY, { variables: { first } });

    return response.data?.products;
  } catch (error) {
    return handleGraphQLError(error, shopDomain);
  }
}

export async function fetchProductVariants(shopDomain: string, productId: string, first = 50) {
  const client = await getAdminClient(shopDomain);

  try {
    const response = await client.request(GET_PRODUCT_VARIANTS_QUERY, { variables: { id: productId, first } });

    return response.data?.product?.variants;
  } catch (error) {
    return handleGraphQLError(error, shopDomain);
  }
}

export async function fetchInventoryLevels(shopDomain: string, inventoryItemId: string) {
  const client = await getAdminClient(shopDomain);

  try {
    const response = await client.request(GET_INVENTORY_LEVELS_QUERY, { variables: { id: inventoryItemId } });

    return response.data?.inventoryItem?.inventoryLevels;
  } catch (error) {
    return handleGraphQLError(error, shopDomain);
  }
}
