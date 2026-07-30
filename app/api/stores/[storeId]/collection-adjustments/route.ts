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
    const masterStore = await prisma.store.findFirst({
      where: { isMaster: true, isActive: true }
    });

    if (!masterStore) {
      return new NextResponse("Master Store not found", { status: 404 });
    }

    // 2. Fetch all collections from Master Store Shopify API
    const client = await getAdminClient(masterStore.shopDomain);
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

    const shopifyCollections = response?.data?.collections?.edges?.map((e: any) => e.node) || [];

    // 3. Sync to local database under the Master Store's ID
    if (shopifyCollections.length > 0) {
      await prisma.$transaction(
        shopifyCollections.map((col: any) => 
          prisma.collection.upsert({
            where: { storeId_shopifyCollectionId: { storeId: masterStore.id, shopifyCollectionId: col.id } },
            update: { title: col.title, handle: col.handle },
            create: { storeId: masterStore.id, shopifyCollectionId: col.id, title: col.title, handle: col.handle }
          })
        )
      );
    }

    // 4. Fetch all Master Collections
    const allCollections = await prisma.collection.findMany({
      where: { storeId: masterStore.id },
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
            adjustmentValue: parseInt(adjustmentValue, 10) || 0,
          },
          create: {
            storeId,
            collectionId,
            enabled,
            adjustmentType,
            adjustmentValue: parseInt(adjustmentValue, 10) || 0,
          }
        });
        updatedAdjustments.push(record);
      }
    });

    return NextResponse.json({ success: true, count: updatedAdjustments.length });
  } catch (error: any) {
    console.error("[CollectionAdjustments:PUT] Error:", error.message);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
