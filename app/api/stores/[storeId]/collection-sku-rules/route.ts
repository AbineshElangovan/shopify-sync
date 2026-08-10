import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getAdminClient } from "@/lib/shopify/admin";
import { authenticate } from "@/lib/shopify/authenticate";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ storeId: string }> }
) {
  try {
    const { storeId } = await params;

    let currentStore = await prisma.store.findUnique({ where: { id: storeId } });
    if (!currentStore || !currentStore.isActive) {
      return new NextResponse("Active store not found", { status: 404 });
    }

    const connections = await prisma.storeConnection.count({
      where: {
        OR: [
          { sourceStoreId: currentStore.id },
          { targetStoreId: currentStore.id }
        ]
      }
    });
    const isStandalone = connections === 0 && !currentStore.isMaster;

    let targetStore = currentStore;

    // If it's a connected store (not master, not standalone), find its master
    if (!currentStore.isMaster && !isStandalone) {
      targetStore = await prisma.store.findFirst({
        where: { isMaster: true, isActive: true }
      }) || currentStore;
    }

    // 2. Fetch all collections from Target Store Shopify API to ensure fresh sync
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
      console.warn("[CollectionSkuRules:GET] Failed to fetch from Shopify, falling back to DB.", err.message);
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

    // 5. Fetch the target store's SKU rules
    const skuRules = await prisma.collectionSkuRule.findMany({
      where: { storeId: storeId }
    });
    
    const ruleMap = new Map();
    skuRules.forEach(rule => ruleMap.set(rule.collectionId, rule));

    // 6. Merge them for the response
    const payload = allCollections.map(col => {
      const rule = ruleMap.get(col.id);
      return {
        ...col,
        skuRule: rule || null
      };
    });

    return NextResponse.json(payload);
  } catch (error: any) {
    console.error("[CollectionSkuRules:GET] Error:", error.message);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ storeId: string }> }
) {
  try {
    const { store } = await authenticate(req);
    
    const connections = await prisma.storeConnection.count({
      where: {
        OR: [
          { sourceStoreId: store.id },
          { targetStoreId: store.id }
        ]
      }
    });
    const isStandalone = connections === 0 && !(store as any).isMaster;
    const canManageSku = (store as any).isMaster || isStandalone;

    if (!canManageSku) {
      return new NextResponse("Unauthorized. Store lacks capability to manage SKU settings.", { status: 403 });
    }

    const { storeId } = await params;
    
    // Ensure the store is operating on its own rules
    if (store.id !== storeId) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    const body = await req.json();
    const { rules } = body; // Array of { collectionId, enabled, skuPrefix, startSequence }

    if (!Array.isArray(rules)) {
      return new NextResponse("Invalid payload", { status: 400 });
    }

    const updatedRules = [];

    await prisma.$transaction(async (tx) => {
      for (const rule of rules) {
        const { collectionId, enabled, skuPrefix, startSequence } = rule;
        
        const existingRule = await tx.collectionSkuRule.findUnique({
          where: { storeId_collectionId: { storeId, collectionId } }
        });

        let newStart = parseInt(startSequence, 10) || 1;
        let updateData: any = {
          enabled,
          skuPrefix: skuPrefix || "",
          startSequence: newStart,
        };

        // If they increased the start sequence past the current sequence, update currentSequence too.
        if (existingRule && newStart > existingRule.currentSequence) {
          updateData.currentSequence = newStart;
        }

        const record = await tx.collectionSkuRule.upsert({
          where: { storeId_collectionId: { storeId, collectionId } },
          update: updateData,
          create: {
            storeId,
            collectionId,
            enabled,
            skuPrefix: skuPrefix || "",
            startSequence: newStart,
            currentSequence: newStart,
          }
        });
        updatedRules.push(record);
      }
    });

    return NextResponse.json({ success: true, count: updatedRules.length });
  } catch (error: any) {
    console.error("[CollectionSkuRules:PUT] Error:", error.message);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
