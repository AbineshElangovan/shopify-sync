import { NextRequest } from "next/server";
import { shopify } from "@/lib/shopify/index";

export async function GET(req: NextRequest) {
  const shop = req.nextUrl.searchParams.get("shop");

  if (!shop) {
    return new Response("Missing shop parameter", { status: 400 });
  }

  const sanitizedShop = shopify.utils.sanitizeShop(shop, true);

  if (!sanitizedShop) {
    return new Response("Invalid shop domain", { status: 400 });
  }

  return shopify.auth.begin({
    shop: sanitizedShop,
    callbackPath: "/api/auth/callback",
    isOnline: false,
    rawRequest: req,
  });
}