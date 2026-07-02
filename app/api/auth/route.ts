import { NextRequest } from "next/server";
import { shopify } from "@/lib/shopify/index";

export async function GET(req: NextRequest) {
  const shop = req.nextUrl.searchParams.get("shop");
  console.log("[Install] auth route hit", { shop, url: req.url });

  if (!shop) {
    console.log("[Install] missing shop parameter");
    return new Response("Missing shop parameter", { status: 400 });
  }

  const sanitizedShop = shopify.utils.sanitizeShop(shop, true);
  console.log("[Install] sanitized shop", { sanitizedShop });

  if (!sanitizedShop) {
    console.log("[Install] invalid shop domain");
    return new Response("Invalid shop domain", { status: 400 });
  }

  try {
    const response = await shopify.auth.begin({
      shop: sanitizedShop,
      callbackPath: "/api/auth/callback",
      isOnline: false,
      rawRequest: req,
    });

    console.log("[Install] auth.begin response", {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
    });

    return response;
  } catch (error: any) {
    console.error("[Install] auth.begin failed", {
      message: error?.message,
      stack: error?.stack,
    });
    return new Response(`Failed to start OAuth flow: ${error.message}`, { status: 500 });
  }
}