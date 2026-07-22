import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export async function POST(req: NextRequest) {
  try {
    const timestamp = Date.now();
    const manualShopDomain = `manual-store-${timestamp}.local`;
    const label = `Manual Store ${new Date().toLocaleString()}`;

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
