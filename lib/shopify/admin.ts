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

  let session = await shopify.config.sessionStorage.loadSession(`offline_${shopDomain}`);

  if (session && !session.isActive(shopify.config.scopes)) {
    if (session.refreshToken) {
      console.log(`[AdminClient] Session for ${shopDomain} is expired. Refreshing...`);
      try {
        const url = `https://${shopDomain}/admin/oauth/access_token`;
        const body = JSON.stringify({
          client_id: shopify.config.apiKey,
          client_secret: shopify.config.apiSecretKey,
          grant_type: "refresh_token",
          refresh_token: session.refreshToken
        });

        const refreshRes = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body
        });

        if (!refreshRes.ok) {
          const errText = await refreshRes.text();
          throw new Error(`Shopify API error ${refreshRes.status}: ${errText}`);
        }

        const data = await refreshRes.json();
        
        if (data.access_token) {
          session.accessToken = data.access_token;
          if (data.expires_in) {
            const expires = new Date();
            expires.setSeconds(expires.getSeconds() + data.expires_in);
            session.expires = expires;
          }
          if (data.refresh_token) {
            session.refreshToken = data.refresh_token;
          }

          await shopify.config.sessionStorage.storeSession(session as Session);
          
          await prisma.store.update({
            where: { shopDomain },
            data: { accessToken: session.accessToken }
          });
          console.log(`[AdminClient] Token refreshed successfully.`);
        } else {
          throw new Error("No access_token in refresh response");
        }
      } catch (err) {
        console.error(`[AdminClient] Failed to refresh token for ${shopDomain}:`, err);
      }
    }
  }

  if (!session) {
    session = new Session({
      id: `offline_${shopDomain}`,
      shop: shopDomain,
      state: "offline",
      isOnline: false,
      accessToken: store.accessToken!,
    });
  }

  const client = new shopify.clients.Graphql({ session: session as Session });
  console.log("[AdminClient] GraphQL client initialized successfully.");
  return client;
}

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
