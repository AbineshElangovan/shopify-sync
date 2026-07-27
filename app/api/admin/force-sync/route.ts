import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { syncStoreProducts } from "@/lib/shopify/sync-service";

export async function GET(req: NextRequest) {
  try {
    const stores = await prisma.store.findMany({ where: { isActive: true } });
    for (const store of stores) {
      console.log('Force Syncing Store:', store.shopDomain);
      await syncStoreProducts(store.shopDomain);
    }
    return NextResponse.json({ success: true, message: "Forced full sync on all stores" });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
