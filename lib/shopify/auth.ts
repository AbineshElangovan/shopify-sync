import { NextRequest, NextResponse } from "next/server";
import { shopify } from "@/lib/shopify";
import { prisma } from "@/lib/db/prisma";

export class AuthError extends Error {}

export async function authenticate(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "");

  if (!token) {
    throw new AuthError("Missing session token");
  }

  let payload;
  try {
    payload = await shopify.session.decodeSessionToken(token);
  } catch (err) {
    throw new AuthError("Invalid session token");
  }


  const shop = payload.dest.replace(/^https?:\/\//, "");

  const store = await prisma.store.findUnique({ where: { shopDomain: shop } });
  if (!store || !store.isActive) {
    throw new AuthError("Store not installed or inactive");
  }

  return { shop, store };
}