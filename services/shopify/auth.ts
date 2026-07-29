import { shopify } from "@/lib/shopify";
import { prisma } from "@/lib/db/prisma";
import { registerWebhooks } from "@/lib/shopify/webhooks";
import { NextRequest } from "next/server";
import { redirect } from "next/navigation";
import { syncStoreProducts } from "./bulk-sync";
import { hasValidShopifyAccessToken } from "./utils";

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
    expiring: true,
  } as any);
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
  let shopifyStoreId: string | null = null;
  try {
    console.log("[OAuth] Fetching shop details from Shopify GraphQL API for:", normalizedShop);
    const client = new shopify.clients.Graphql({ session });
    const shopResponse: any = await client.request(`
      query {
        shop {
          id
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
    
    if (shopResponse.data?.shop?.id) {
      shopifyStoreId = shopResponse.data.shop.id;
    }
  } catch (error: any) {
    console.error("[OAuth] Failed to fetch shop details from Shopify:", error.message);
    console.log("[OAuth] Falling back to shop domain as label:", normalizedShop);
  }
  console.log("[OAuth] Upserting store record in database for shop:", normalizedShop);
  
  const existingStore = await prisma.store.findUnique({ where: { shopDomain: normalizedShop } });
  const isReinstall = existingStore && !existingStore.isActive;
  
  const updateData: any = {
    accessToken: accessToken,
    scope: scope || "",
    isActive: true,
    label: shopLabel,
  };
  
  if (shopifyStoreId) {
    updateData.shopifyStoreId = shopifyStoreId;
  }

  if (isReinstall) {
    updateData.uniqueStoreId = `STORE-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
  }

  const storedShop = await prisma.store.upsert({
    where: { shopDomain: normalizedShop },
    update: updateData,
    create: {
      shopDomain: normalizedShop,
      shopifyStoreId: shopifyStoreId,
      accessToken: accessToken,
      scope: scope || "",
      isActive: true,
      label: shopLabel,
      uniqueStoreId: `STORE-${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
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

  return Response.redirect(redirectUrl);
}

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
