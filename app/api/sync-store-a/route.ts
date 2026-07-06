
import { NextRequest, NextResponse } from "next/server";
import { syncStoreA } from "@/services/shopify";
import { prisma } from "@/lib/db/prisma";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    let shop = searchParams.get("shop");

    // If shop is not provided, try to find the first active store in the database
    if (!shop) {
      const activeStore = await prisma.store.findFirst({
        where: { isActive: true },
      });
      if (activeStore) {
        shop = activeStore.shopDomain;
      }
    }

    if (!shop) {
      return NextResponse.json(
        { success: false, error: "Missing active shop domain parameter" },
        { status: 400 }
      );
    }

    console.log(`[API:sync-store-a] GET request received for shop: ${shop}`);
    const result = await syncStoreA(shop);

    return NextResponse.json({
      success: true,
      shop: result.shop,
      products: result.products,
      variants: result.variants,
      inventory: result.inventory,
    });
  } catch (error: any) {
    console.error("[API:sync-store-a] GET handler error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "An unexpected error occurred" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      // Empty or invalid body
    }

    const { searchParams } = req.nextUrl;
    let shop = body.shop || searchParams.get("shop");

    // If shop is not provided, try to find the first active store in the database
    if (!shop) {
      const activeStore = await prisma.store.findFirst({
        where: { isActive: true },
      });
      if (activeStore) {
        shop = activeStore.shopDomain;
      }
    }

    if (!shop) {
      return NextResponse.json(
        { success: false, error: "Missing active shop domain parameter" },
        { status: 400 }
      );
    }

    console.log(`[API:sync-store-a] POST request received for shop: ${shop}`);
    const result = await syncStoreA(shop);

    return NextResponse.json({
      success: true,
      shop: result.shop,
      products: result.products,
      variants: result.variants,
      inventory: result.inventory,
    });
  } catch (error: any) {
    console.error("[API:sync-store-a] POST handler error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
