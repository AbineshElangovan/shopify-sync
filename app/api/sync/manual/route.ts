import { NextRequest, NextResponse } from "next/server";
import { authenticate } from "@/lib/shopify/authenticate";
import { prisma } from "@/lib/db/prisma";
import { syncStoreProducts } from "@/services/shopify";

export async function POST(req: NextRequest) {
  try {
    const { store } = await authenticate(req);
    const body = await req.json();
    const { selectedTargetStoreIds } = body;

    if (!selectedTargetStoreIds || !Array.isArray(selectedTargetStoreIds) || selectedTargetStoreIds.length === 0) {
      return NextResponse.json({ success: false, error: "No target stores selected" }, { status: 400 });
    }

    // Verify connections exist
    const connections = await prisma.storeConnection.findMany({
      where: {
        targetStoreId: { in: selectedTargetStoreIds }
      }
    });

    if (connections.length !== selectedTargetStoreIds.length) {
      return NextResponse.json({ success: false, error: "One or more selected stores are not explicitly connected." }, { status: 400 });
    }

    // Start background sync
    setTimeout(async () => {
      try {
        console.log("[Manual Sync] Starting background manual sync for", selectedTargetStoreIds.length, "stores");
        
        // Fetch valid target stores
        const targetStores = await prisma.store.findMany({
          where: { id: { in: selectedTargetStoreIds }, isActive: true }
        });

        // Run full product sync for each target store
        for (const targetStore of targetStores) {
           await syncStoreProducts(targetStore.shopDomain);
        }
        
        console.log("[Manual Sync] Completed full sync to selected stores.");
      } catch (err: any) {
        console.error("[Manual Sync] Background Error:", err);
      }
    }, 100);

    return NextResponse.json({ success: true, message: "Sync initiated" });
  } catch (err: any) {
    console.error("[Manual Sync API] POST Error:", err.message);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
