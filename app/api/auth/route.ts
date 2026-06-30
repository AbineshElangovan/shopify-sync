import { NextRequest } from "next/server";
import { shopify } from "@/lib/shopify";

export async function GET(req: NextRequest) {
  const shop = req.nextUrl.searchParams.get("shop");
  if (!shop) {
    return new Response("Missing shop parameter", { status: 400 });
  }

  return shopify.auth.begin({
    shop: shopify.utils.sanitizeShop(shop, true)!,
    callbackPath: "/api/auth/callback",
    isOnline: false,
    rawRequest: req,
  });
}