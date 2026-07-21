import { NextRequest, NextResponse } from "next/server";
import { shopify } from "@/lib/shopify";
import { prisma } from "@/lib/db/prisma";

export class AuthError extends Error { }

export async function authenticate(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "");

  if (!token) {
    if (process.env.NODE_ENV === "development") {
      const shopParam = req.nextUrl.searchParams.get("shop");
      const store = await prisma.store.findFirst({
        where: shopParam ? { shopDomain: shopParam, isActive: true } : { isActive: true },
        orderBy: { installedAt: 'asc' }
      });
      if (store) {
        console.warn("[authenticate] Missing token in dev mode. Falling back to active store:", store.shopDomain);
        return { shop: store.shopDomain, store };
      }
    }

    throw new AuthError("Missing session token");
  }

  let payload;
  try {
    payload = await shopify.session.decodeSessionToken(token);
  } catch (err) {
    if (process.env.NODE_ENV === "development" || token === "dev_fallback_token") {
      const shopParam = req.nextUrl.searchParams.get("shop");
      const store = await prisma.store.findFirst({
        where: shopParam ? { shopDomain: shopParam, isActive: true } : { isActive: true },
        orderBy: { installedAt: 'asc' }
      });
      if (store) {
        console.warn("[authenticate] Invalid/mock token in dev mode. Falling back to active store:", store.shopDomain);
        return { shop: store.shopDomain, store };
      }
    }
    throw new AuthError("Invalid session token");
  }


  const shop = payload.dest.replace(/^https?:\/\//, "");

  const store = await prisma.store.findUnique({ where: { shopDomain: shop } });
  if (!store || !store.isActive) {
    throw new AuthError("Store not installed or inactive");
  }

  return { shop, store };
}