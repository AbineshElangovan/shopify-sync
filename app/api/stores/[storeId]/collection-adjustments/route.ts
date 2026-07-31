import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getAdminClient } from "@/lib/shopify/admin";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ storeId: string }> }
) {
  try {
    const { storeId } = await params;

    // 1. Find the Master Store to act as the source of truth for collections
    let targetStore = await prisma.store.findFirst({
      where: { isMaster: true, isActive: true }
    });

    if (!targetStore) {
      targetStore = await prisma.store.findUnique({ where: { id: storeId } });
      if (!targetStore || !targetStore.isActive) {
        return new NextResponse("Active store not found", { status: 404 });
      }
    }

    // 2. Fetch all collections from Target Store Shopify API
    let shopifyCollections: any[] = [];
    try {
      const client = await getAdminClient(targetStore.shopDomain);
      const response: any = await client.request(`
        query getCollections {
          collections(first: 250) {
            edges {
              node {
                id
                title
                handle
              }
            }
          }
        }
      `);
      shopifyCollections = response?.data?.collections?.edges?.map((e: any) => e.node) || [];
    } catch (err: any) {
      console.warn("[CollectionAdjustments:GET] Failed to fetch from Shopify, falling back to DB.", err.message);
    }

    // 3. Sync to local database under the Target Store's ID
    if (shopifyCollections.length > 0) {
      await prisma.$transaction(
        shopifyCollections.map((col: any) => 
          prisma.collection.upsert({
            where: { storeId_shopifyCollectionId: { storeId: targetStore.id, shopifyCollectionId: col.id } },
            update: { title: col.title, handle: col.handle },
            create: { storeId: targetStore.id, shopifyCollectionId: col.id, title: col.title, handle: col.handle }
          })
        )
      );
    }

    // 4. Fetch all Target Collections
    const allCollections = await prisma.collection.findMany({
      where: { storeId: targetStore.id },
      orderBy: { title: "asc" },
    });

    // 5. Fetch the target store's adjustments
    const storeAdjustments = await prisma.collectionPriceAdjustment.findMany({
      where: { storeId: storeId }
    });
    
    const adjMap = new Map();
    storeAdjustments.forEach(adj => adjMap.set(adj.collectionId, adj));

    // 6. Merge them for the response
    const payload = allCollections.map(col => {
      const adj = adjMap.get(col.id);
      return {
        ...col,
        priceAdjustment: adj || null
      };
    });

    return NextResponse.json(payload);
  } catch (error: any) {
    console.error("[CollectionAdjustments:GET] Error:", error.message);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

import { applyPriceAdjustmentToStore } from "@/services/shopify/pricing";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ storeId: string }> }
) {
  try {
    const { storeId } = await params;
    const body = await req.json();
    const { adjustments } = body; // Array of { collectionId, enabled, adjustmentType, adjustmentValue }

    if (!Array.isArray(adjustments)) {
      return new NextResponse("Invalid payload", { status: 400 });
    }

    const updatedAdjustments = [];

    // Use a transaction for bulk update
    await prisma.$transaction(async (tx) => {
      for (const adj of adjustments) {
        const { collectionId, enabled, adjustmentType, adjustmentValue } = adj;
        
        const record = await tx.collectionPriceAdjustment.upsert({
          where: { storeId_collectionId: { storeId, collectionId } },
          update: {
            enabled,
            adjustmentType,
            adjustmentValue: parseFloat(adjustmentValue) || 0,
          },
          create: {
            storeId,
            collectionId,
            enabled,
            adjustmentType,
            adjustmentValue: parseFloat(adjustmentValue) || 0,
          }
        });
        updatedAdjustments.push(record);
      }
    });

    // Trigger price application asynchronously so it doesn't block the UI response
    // We must apply adjustments to the TARGET store(s), because variant maps belong to target stores.
    const activeStores = await prisma.store.findMany({ where: { isActive: true } });
    const targetStores = activeStores.filter(s => !s.isMaster);
    
    for (const ts of targetStores) {
      applyPriceAdjustmentToStore(ts.id).catch(err => {
        console.error(`[CollectionAdjustments:PUT] Failed to apply price adjustments for target store ${ts.id}:`, err);
      });
    }

    return NextResponse.json({ success: true, count: updatedAdjustments.length });
  } catch (error: any) {
    console.error("[CollectionAdjustments:PUT] Error:", error.message);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
