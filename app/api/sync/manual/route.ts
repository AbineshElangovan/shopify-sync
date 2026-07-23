import { NextRequest, NextResponse } from "next/server";
import { authenticate, handleApiError } from "@/lib/shopify/authenticate";
import { prisma } from "@/lib/db/prisma";
import { pushProductsToDestinations } from "@/services/shopify/push-sync";

export async function POST(req: NextRequest) {
  try {
    const { store } = await authenticate(req);
    const body = await req.json();
    const { selectedTargetStoreIds } = body;

    if (!selectedTargetStoreIds || !Array.isArray(selectedTargetStoreIds) || selectedTargetStoreIds.length === 0) {
      return NextResponse.json({ success: false, error: "No target stores selected" }, { status: 400 });
    }

    // Verify connections exist and belong to the authenticated store
    const connections = await prisma.storeConnection.findMany({
      where: {
        sourceStoreId: store.id,
        targetStoreId: { in: selectedTargetStoreIds }
      }
    });

    if (connections.length !== selectedTargetStoreIds.length) {
      return NextResponse.json({ success: false, error: "One or more selected stores are not explicitly connected to your store." }, { status: 400 });
    }

    // Start background sync
    setTimeout(async () => {
      try {
        console.log("[Manual Sync] Starting background manual sync for", selectedTargetStoreIds.length, "stores");
        
        // Fetch valid target stores
        // We only need the source store ID, which is `store.id` from the authenticate() call.
        await pushProductsToDestinations(store.id, selectedTargetStoreIds);
        
        console.log("[Manual Sync] Completed full push sync to selected stores.");
      } catch (err: any) {
        console.error("[Manual Sync] Background Error:", err);
      }
    }, 100);

    return NextResponse.json({ success: true, message: "Sync initiated" });
  } catch (err: any) {
    console.error("[Manual Sync API] POST Error:", err.message);
    return handleApiError(err);
  }
}
