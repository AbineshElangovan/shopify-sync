import { NextRequest, NextResponse } from "next/server";
import { shopify } from "@/lib/shopify";
import { prisma } from "@/lib/db/prisma";

export class AuthError extends Error { }

export async function authenticate(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "");

  if (!token) {
    throw new AuthError("Unauthorized access. Please log in through Shopify Admin.");
  }

  // --- DEV FALLBACK FOR LOCAL BROWSER TESTING ---
  if (process.env.NODE_ENV === "development" && token === "dev_fallback_token") {
    // Try to get shop from URL first
    const urlShop = req.nextUrl?.searchParams?.get("shop");
    
    let store;
    if (urlShop) {
      store = await prisma.store.findFirst({ where: { shopDomain: urlShop, isActive: true } });
    }
    
    // Fallback to first active store if no shop in URL or shop not found
    if (!store) {
      store = await prisma.store.findFirst({ where: { isActive: true } });
    }
    
    if (!store) {
      throw new AuthError("No active dev store found. Please install the app on a dev store first.");
    }
    return { shop: store.shopDomain, store };
  }

  let payload;
  try {
    payload = await shopify.session.decodeSessionToken(token);
  } catch (err) {
    throw new AuthError("Unauthorized access. Please log in through Shopify Admin.");
  }


  const shop = payload.dest.replace(/^https?:\/\//, "");

  const store = await prisma.store.findUnique({ where: { shopDomain: shop } });
  if (!store || !store.isActive) {
    throw new AuthError("Store not installed or inactive");
  }

  return { shop, store };
}

export function handleApiError(error: any) {
  if (error instanceof AuthError) {
    return NextResponse.json({ success: false, message: error.message }, { status: 401 });
  }
  return NextResponse.json({ success: false, error: error.message }, { status: 500 });
}