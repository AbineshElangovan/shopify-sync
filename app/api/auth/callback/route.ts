import { NextRequest, NextResponse } from "next/server";
import { shopify } from "@/lib/shopify";
import { prisma } from "@/lib/db/prisma";
import { registerWebhooks } from "@/lib/shopify/webhooks";
import { syncStoreProducts } from "@/lib/shopify/sync-service";

export async function GET(req: NextRequest) {
  try {
    console.log("[OAuth] callback start", { url: req.url, shop: req.nextUrl.searchParams.get("shop") });

    const callbackResponse = await shopify.auth.callback({
      rawRequest: req,
    });

    const { session, headers } = callbackResponse;
    const { shop, accessToken, scope } = session;

    console.log("[OAuth] callback response", {
      shop,
      hasAccessToken: Boolean(accessToken),
      scope,
    });

    if (!accessToken) {
      throw new Error("No access token provided by Shopify");
    }

    const normalizedShop = shop.trim().toLowerCase();
    console.log("[OAuth] normalized shop", { normalizedShop });

    // Only clean up obviously invalid/seed store records — never touch real store records
    console.log("[OAuth] running store cleanup before upsert");
    await prisma.store.deleteMany({
      where: {
        OR: [
          { shopDomain: { contains: 'mock', mode: 'insensitive' } },
          { shopDomain: { contains: 'seed', mode: 'insensitive' } },
          { accessToken: { contains: 'mock', mode: 'insensitive' } },
          { accessToken: { contains: 'placeholder', mode: 'insensitive' } },
          { accessToken: { startsWith: 'your_' } },
          { accessToken: { startsWith: 'your-' } },
        ],
      },
    });
    console.log("[OAuth] store cleanup complete");

    console.log("[OAuth] upserting store record");
    const storedShop = await prisma.store.upsert({
      where: { shopDomain: normalizedShop },
      update: {
        accessToken: accessToken,
        scope: scope || "",
        isActive: true,
        label: normalizedShop,
      },
      create: {
        shopDomain: normalizedShop,
        accessToken: accessToken,
        scope: scope || "",
        isActive: true,
        label: normalizedShop,
      },
    });
    console.log("[OAuth] store record persisted", { shopDomain: storedShop.shopDomain, id: storedShop.id });

    // The session itself is automatically saved to the Session table by PrismaSessionStorage
    // because we provided sessionStorage to the shopifyApi() configuration in lib/shopify/index.ts.

    try {
      console.log("[OAuth] registering webhooks");
      await registerWebhooks(session);
      console.log("[OAuth] webhooks registered");
    } catch (error) {
      console.error("Webhook registration failed during OAuth callback:", error);
    }

    // Fire product sync in the background — do NOT await so the redirect is immediate
    // The sync runs against normalizedShop which matches the upserted store record exactly
    syncStoreProducts(normalizedShop).then((syncResult) => {
      console.log("[OAuth] background syncStoreProducts completed", { shop: normalizedShop, syncResult });
    }).catch((error) => {
      console.error(`[OAuth] background product sync failed for ${normalizedShop}:`, error);
    });

    // Get the redirect URL back to the embedded application
    const redirectUrl = await shopify.auth.getEmbeddedAppUrl({
      rawRequest: req,
    });
    
    const response = NextResponse.redirect(redirectUrl);
    
    // Pass along any headers returned by the SDK (like Set-Cookie)
    if (headers) {
      headers.forEach((value: string, key: string) => {
        response.headers.set(key, value);
      });
    }

    return response;
  } catch (error: any) {
    console.error("[OAuth] callback error", {
      message: error?.message,
      stack: error?.stack,
    });
    return new NextResponse(`Failed to complete OAuth process: ${error.message}`, { status: 500 });
  }
}