import { NextRequest, NextResponse } from "next/server";
import { fetchShopInfo, fetchProducts } from "@/lib/shopify/admin";

export async function GET(req: NextRequest) {
  const shop = req.nextUrl.searchParams.get("shop");

  if (!shop) {
    return NextResponse.json({ error: "Missing shop parameter" }, { status: 400 });
  }

  try {
    const shopInfo = await fetchShopInfo(shop);
    const products = await fetchProducts(shop, 5); // Fetch first 5 products for testing

    return NextResponse.json({
      success: true,
      shop: shopInfo,
      products: products,
    });
  } catch (error: any) {
    console.error("Test Admin API Error:", error);
    return NextResponse.json({
      success: false,
      error: error.message || "An unexpected error occurred",
    }, { status: 500 });
  }
}
