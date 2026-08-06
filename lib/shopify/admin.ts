import { shopify } from "@/lib/shopify";
import { prisma } from "@/lib/db/prisma";
import { Session, GraphqlQueryError } from "@shopify/shopify-api";
import {
  SHOP_INFO_QUERY,
  GET_PRODUCTS_BASIC_QUERY,
  GET_PRODUCT_VARIANTS_QUERY,
  GET_INVENTORY_LEVELS_QUERY,
} from "@/services/shopify/graphql";
import { encrypt, decrypt } from "@/lib/utils/encryption";

export async function refreshOfflineToken(store: any) {
  if (!store.refreshToken) {
    throw new Error(`Store ${store.shopDomain} has no refresh token.`);
  }

  console.log(`===== REFRESH TOKEN for ${store.shopDomain} =====`);
  
  const clientId = process.env.SHOPIFY_API_KEY;
  const clientSecret = process.env.SHOPIFY_API_SECRET;

  let decryptedRefreshToken;
  try {
    decryptedRefreshToken = decrypt(store.refreshToken);
  } catch (error: any) {
    console.error(`[AdminClient] Failed to decrypt refresh token for ${store.shopDomain}:`, error.message);
    throw new Error("Invalid encrypted refresh token format");
  }

  const response = await fetch(`https://${store.shopDomain}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: decryptedRefreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error("Refresh failed:", errText);
    throw new Error("Failed to refresh Shopify token.");
  }

  const data = await response.json();
  
  console.log("===== REFRESH SUCCESS =====");
  console.log({
    hasNewAccessToken: !!data.access_token,
    hasNewRefreshToken: !!data.refresh_token,
    expiresIn: data.expires_in,
  });

  // Calculate new expiration dates
  const now = new Date();
  const expiresAt = new Date(now.getTime() + (data.expires_in * 1000));
  
  // If Shopify doesn't return a new refresh token, we keep the old one. But usually they do.
  // Shopify doesn't always document `refresh_token_expires_in` in standard responses for offline, but if it's there:
  const refreshTokenExpiresAt = data.refresh_token_expires_in 
    ? new Date(now.getTime() + (data.refresh_token_expires_in * 1000))
    : store.refreshTokenExpiresAt; // keep existing

  const updatedStore = await prisma.store.update({
    where: { id: store.id },
    data: {
      accessToken: encrypt(data.access_token),
      refreshToken: data.refresh_token ? encrypt(data.refresh_token) : store.refreshToken,
      expiresAt,
      refreshTokenExpiresAt,
    },
  });

  return updatedStore;
  
}

export async function getAdminClient(shopDomain: string) {
  console.log("[AdminClient] Initializing getAdminClient for shop:", shopDomain);
  const store = await prisma.store.findUnique({
    where: { shopDomain },
  });
  console.log("===== ADMIN CLIENT =====");
  console.log("Shop:", shopDomain);
  console.log("Store Exists:", !!store);
  console.log("Access Token Exists:", !!store?.accessToken);
  console.log("Database Updated At:", store?.updatedAt);

  if (!store || !store.isActive) {
    throw new Error(`Store ${shopDomain} is not active or not found.`);
  }

  let activeStore = store;

  // Check if we need to refresh the token
  if (!activeStore.expiresAt) {
    console.warn(`[AdminClient] Store ${shopDomain} has no expiresAt. Proceeding with existing token.`);
  } else {
    const now = new Date();
    // FOR TESTING: Refresh if the token has lived for more than 5 minutes
    // A fresh token lives for 60 mins. If timeUntilExpiry < 55 mins, it has lived for 5 mins.
    const timeUntilExpiry = activeStore.expiresAt.getTime() - now.getTime();
    if (timeUntilExpiry < 60 * 60 * 1000) {
      console.log(`[AdminClient] TESTING MODE: Token for ${shopDomain} is older than 60 minutes. Attempting refresh...`);
      
      let oldDecryptedToken = "UNKNOWN";
      if (activeStore.accessToken) {
        try {
          oldDecryptedToken = decrypt(activeStore.accessToken);
        } catch(e) {}
      }
      const maskedOld = `${oldDecryptedToken.substring(0, 10)}...${oldDecryptedToken.substring(oldDecryptedToken.length - 4)}`;
      console.log(`[AdminClient] OLD ACCESS TOKEN: ${maskedOld}`);

      try {
        const refreshedStore = await refreshOfflineToken(activeStore);
        if (refreshedStore) {
          activeStore = refreshedStore;
          
          let newDecryptedToken = "UNKNOWN";
          if (activeStore.accessToken) {
            try {
              newDecryptedToken = decrypt(activeStore.accessToken);
            } catch(e) {}
          }
          const maskedNew = `${newDecryptedToken.substring(0, 10)}...${newDecryptedToken.substring(newDecryptedToken.length - 4)}`;
          console.log(`[AdminClient] NEW ACCESS TOKEN: ${maskedNew}`);
          console.log(`[AdminClient] Token successfully changed!`);
        }
      } catch (error: any) {
        console.error(`[AdminClient] Failed to refresh token proactively for ${shopDomain}:`, error.message);
      }
    }
  }

  // 1. Strict Validation
  if (!activeStore.accessToken || activeStore.accessToken.trim() === "") {
    console.error(`[AdminClient] CRITICAL: Store ${shopDomain} has an empty access token.`);
    throw new Error(`CRITICAL: Store ${shopDomain} has an empty access token.`);
  }

  let decryptedAccessToken;
  try {
    decryptedAccessToken = decrypt(activeStore.accessToken);
  } catch (error: any) {
    console.error(`[AdminClient] Failed to decrypt access token for ${shopDomain}:`, error.message);
    await prisma.store.update({
      where: { shopDomain },
      data: { 
        isActive: false,
        authStatus: "INVALID_TOKEN" 
      },
    });
    throw new Error(`CRITICAL: Store ${shopDomain} access token decryption failed. Marked inactive.`);
  }

  const maskedToken = `${decryptedAccessToken.substring(0, 10)}...${decryptedAccessToken.substring(decryptedAccessToken.length - 4)}`;
  console.log("[AdminClient] Instantiating offline Session with Store token:", maskedToken);

  console.log("Token starts with:", decryptedAccessToken.substring(0, 20));
  console.log("Token length:", decryptedAccessToken.length);

  console.log("===== USING TOKEN =====");
  console.log({
    shop: shopDomain,
    hasAccessToken: !!decryptedAccessToken,
    hasRefreshToken: !!(activeStore as any).refreshToken,
    expiresAt: activeStore.expiresAt,
    refreshTokenExpiresAt: (activeStore as any).refreshTokenExpiresAt,
  });

  console.log("===== TOKEN STATUS =====");
  if (activeStore.expiresAt) {
    console.log({
      now: new Date(),
      expiresAt: activeStore.expiresAt,
      expired: new Date() >= new Date(activeStore.expiresAt),
    });
  }

  // 2. Single Source of Truth
  // We construct an ephemeral Session object solely for the SDK to use.
  // We DO NOT fetch from or write to the Shopify-managed Session table.
  const session = new Session({
    id: `offline_${shopDomain}`,
    shop: shopDomain,
    state: "offline",
    isOnline: false,
    accessToken: decryptedAccessToken,
  });

  const client = new shopify.clients.Graphql({ session: session as Session });
  console.log("[AdminClient] GraphQL client initialized successfully.");

  return client;
}

export async function handleGraphQLError(error: any, shopDomain: string) {
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
    console.error("===== SHOPIFY 401 =====");
    
    // We already do proactive refresh in getAdminClient.
    // If we hit a 401 here, it means either:
    // 1. Proactive refresh failed.
    // 2. The token was revoked by the merchant uninstalling the app.
    // 3. We didn't have a refresh token or it was missing.
    console.warn(`Access token invalid for ${shopDomain}. Marking store as inactive as a permanent failure.`);
    await prisma.store.update({
      where: { shopDomain },
      data: { 
        isActive: false,
        authStatus: "INVALID_TOKEN" 
      },
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
