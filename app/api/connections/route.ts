import { NextRequest, NextResponse } from "next/server";
import { authenticate, handleApiError } from "@/lib/shopify/authenticate";
import { fetchShopInfo } from "@/lib/shopify/admin";
import { prisma } from "@/lib/db/prisma";

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { store } = await authenticate(req);

    // Fetch outgoing connections
    const outgoing = await prisma.storeConnection.findMany({
      where: { sourceStoreId: store.id },
      include: { targetStore: true }
    });

    // Fetch incoming connections (the master store)
    const incoming = await prisma.storeConnection.findMany({
      where: { targetStoreId: store.id },
      include: { sourceStore: true }
    });

    // Fetch sibling connections (other sub-stores connected to our master)
    const masterStoreIds = incoming.map(c => c.sourceStoreId);
    let siblings: any[] = [];
    if (masterStoreIds.length > 0) {
      siblings = await prisma.storeConnection.findMany({
        where: {
          sourceStoreId: { in: masterStoreIds },
          targetStoreId: { not: store.id } // Exclude ourselves
        },
        include: { targetStore: true }
      });
    }

    // We need to fetch extra metadata for each connection asynchronously
    const connectionPromises = [
      ...outgoing.map(async c => {
        let shopInfo = null;
        try { if (c.targetStore.isActive) shopInfo = await fetchShopInfo(c.targetStore.shopDomain); } catch (e) { }
        const productCount = await prisma.productCache.count({ where: { storeId: c.targetStore.id } });
        return {
          targetStoreId: c.targetStoreId,
          direction: 'outgoing',
          lastSyncTime: c.targetStore.updatedAt,
          targetStore: {
            id: c.targetStore.id,
            shopDomain: c.targetStore.shopDomain,
            label: c.targetStore.label,
            uniqueStoreId: c.targetStore.uniqueStoreId,
            isActive: c.targetStore.isActive,
            currency: shopInfo?.currencyCode,
            region: shopInfo?.billingAddress?.country || 'N/A',
            plan: shopInfo?.plan?.displayName || 'N/A',
            productCount
          }
        };
      }),
      ...incoming.map(async c => {
        let shopInfo = null;
        try { if (c.sourceStore.isActive) shopInfo = await fetchShopInfo(c.sourceStore.shopDomain); } catch (e) { }
        const productCount = await prisma.productCache.count({ where: { storeId: c.sourceStore.id } });
        return {
          targetStoreId: c.sourceStoreId, // mapped for frontend compatibility
          direction: 'incoming',
          lastSyncTime: c.sourceStore.updatedAt,
          targetStore: {
            id: c.sourceStore.id,
            shopDomain: c.sourceStore.shopDomain,
            label: c.sourceStore.label,
            uniqueStoreId: c.sourceStore.uniqueStoreId,
            isActive: c.sourceStore.isActive,
            currency: shopInfo?.currencyCode || 'N/A',
            region: shopInfo?.billingAddress?.country || 'N/A',
            plan: shopInfo?.plan?.displayName || 'N/A',
            productCount
          }
        };
      }),
      ...siblings.map(async c => {
        let shopInfo = null;
        try { if (c.targetStore.isActive) shopInfo = await fetchShopInfo(c.targetStore.shopDomain); } catch (e) { }
        const productCount = await prisma.productCache.count({ where: { storeId: c.targetStore.id } });
        return {
          targetStoreId: c.targetStoreId,
          direction: 'sibling',
          lastSyncTime: c.targetStore.updatedAt,
          targetStore: {
            id: c.targetStore.id,
            shopDomain: c.targetStore.shopDomain,
            label: c.targetStore.label,
            uniqueStoreId: c.targetStore.uniqueStoreId,
            isActive: c.targetStore.isActive,
            currency: shopInfo?.currencyCode || 'N/A',
            region: shopInfo?.billingAddress?.country || 'N/A',
            plan: shopInfo?.plan?.displayName || 'N/A',
            productCount
          }
        };
      })
    ];

    const connections = await Promise.all(connectionPromises);

    // Get Master Product count
    const masterProductCount = incoming.length > 0
      ? await prisma.productCache.count({ where: { storeId: incoming[0].sourceStore.id } })
      : await prisma.productCache.count({ where: { storeId: store.id } });

    // Also get metadata for the current store
    let storeShopInfo = null;
    try { storeShopInfo = await fetchShopInfo(store.shopDomain); } catch (e) { }

    const storeMetadata = {
      currency: storeShopInfo?.currencyCode || 'N/A',
      region: storeShopInfo?.billingAddress?.country || 'N/A',
      plan: storeShopInfo?.plan?.displayName || 'N/A',
      productCount: await prisma.productCache.count({ where: { storeId: store.id } })
    };

    return NextResponse.json({ success: true, store: { ...store, ...storeMetadata }, connections, masterProductCount });
  } catch (err: any) {
    console.error("[Connections API] GET Error:", err.message);
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { store } = await authenticate(req);
    const body = await req.json();
    const { uniqueStoreId } = body;

    if (!uniqueStoreId) {
      return NextResponse.json({ success: false, error: "Unique Store ID is required" }, { status: 400 });
    }

    if (uniqueStoreId === store.uniqueStoreId) {
      return NextResponse.json({ success: false, error: "You cannot connect a store to itself" }, { status: 400 });
    }

    // Find the target store by uniqueStoreId
    const targetStore = await prisma.store.findUnique({
      where: { uniqueStoreId }
    });

    if (!targetStore) {
      return NextResponse.json({ success: false, error: "Invalid Unique Store ID. Store not found." }, { status: 404 });
    }

    // Prevent duplicate connections (in either direction to be safe)
    const existing = await prisma.storeConnection.findFirst({
      where: {
        OR: [
          { sourceStoreId: store.id, targetStoreId: targetStore.id },
          { sourceStoreId: targetStore.id, targetStoreId: store.id }
        ]
      }
    });

    if (existing) {
      return NextResponse.json({ success: false, error: "Store is already connected" }, { status: 400 });
    }

    const connection = await prisma.storeConnection.create({
      data: {
        sourceStoreId: store.id,
        targetStoreId: targetStore.id
      }
    });

    return NextResponse.json({ success: true, connection });
  } catch (err: any) {
    console.error("[Connections API] POST Error:", err.message);
    return handleApiError(err);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { store } = await authenticate(req);
    const url = new URL(req.url);
    const targetStoreId = url.searchParams.get('targetStoreId');

    if (!targetStoreId) {
      return NextResponse.json({ success: false, error: "Target Store ID is required" }, { status: 400 });
    }

    await prisma.storeConnection.deleteMany({
      where: {
        OR: [
          { sourceStoreId: store.id, targetStoreId: targetStoreId },
          { sourceStoreId: targetStoreId, targetStoreId: store.id }
        ]
      }
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[Connections API] DELETE Error:", err.message);
    return handleApiError(err);
  }
}
