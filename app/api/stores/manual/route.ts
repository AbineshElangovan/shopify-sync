import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export async function POST(req: NextRequest) {
  try {
    const manualStoresCount = await prisma.store.count({
      where: { scope: "manual" }
    });
    
    const storeNumber = manualStoresCount + 1;
    const manualShopDomain = `test-store-${storeNumber}.local`;
    const label = `Test Store ${storeNumber}`;

    // Create the store record in Prisma.
    // The schema automatically assigns a unique 'id' and 'uniqueStoreId' using @default(uuid()).
    const store = await prisma.store.create({
      data: {
        shopDomain: manualShopDomain,
        accessToken: "manual-store-token",
        scope: "manual",
        isActive: true,
        label: label,
      }
    });

    return NextResponse.json({ 
      success: true, 
      store: {
        id: store.id,
        uniqueStoreId: store.uniqueStoreId,
        label: store.label,
        shopDomain: store.shopDomain
      } 
    });
  } catch (err: any) {
    console.error("[Manual Store API] POST Error:", err.message);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
