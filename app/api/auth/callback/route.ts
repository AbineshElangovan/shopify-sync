import { NextRequest, NextResponse } from "next/server";
import { shopify } from "@/lib/shopify";
import { prisma } from "@/lib/db/prisma";
import { registerWebhooks } from "@/lib/shopify/webhooks";

export async function GET(req: NextRequest) {
  try {
    const callbackResponse = await shopify.auth.callback({
      rawRequest: req,
    });

    const { session, headers } = callbackResponse;
    const { shop, accessToken, scope } = session;

    if (!accessToken) {
      throw new Error("No access token provided by Shopify");
    }

    // Save or update store details in the Store table using Prisma
    await prisma.store.upsert({
      where: { shopDomain: shop },
      update: {
        accessToken: accessToken,
        scope: scope || "",
        isActive: true,
      },
      create: {
        shopDomain: shop,
        accessToken: accessToken,
        scope: scope || "",
        isActive: true,
      },
    });

    // The session itself is automatically saved to the Session table by PrismaSessionStorage
    // because we provided sessionStorage to the shopifyApi() configuration in lib/shopify/index.ts.

    // Register webhooks for this shop
    await registerWebhooks(session);

    // Get the redirect URL back to the embedded application
    // Wait, getEmbeddedAppUrl might need a string for host or it extracts from the request if missing, but typically it's safer to extract host parameter manually if it needs it.
    const host = req.nextUrl.searchParams.get("host") || "";
    const redirectUrl = await shopify.auth.getEmbeddedAppUrl({
      rawRequest: req,
    });
    
    const response = NextResponse.redirect(redirectUrl);
    
    // Pass along any headers returned by the SDK (like Set-Cookie)
    if (headers) {
      headers.forEach((value, key) => {
        response.headers.set(key, value);
      });
    }

    return response;
  } catch (error: any) {
    console.error("OAuth callback error:", error);
    return new NextResponse(`Failed to complete OAuth process: ${error.message}`, { status: 500 });
  }
}