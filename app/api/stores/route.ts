import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

import { hasValidShopifyAccessToken, applyPriceAdjustmentToStore } from '@/services/shopify';

import { authenticate, handleApiError } from '@/lib/shopify/authenticate';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { store } = await authenticate(req);
    const { searchParams } = req.nextUrl;
    const activeOnly = searchParams.get('active') !== 'false';

    const connections = await (prisma as any).storeConnection.findMany({
      where: { sourceStoreId: store.id }
    });
    
    const connectedStoreIds = connections.map((c: any) => c.targetStoreId);
    const visibleStoreIds = [store.id, ...connectedStoreIds];

    const whereClause: any = { id: { in: visibleStoreIds } };
    if (activeOnly) {
      whereClause.isActive = true;
    }

    const stores = await prisma.store.findMany({
      where: whereClause,
      orderBy: { installedAt: 'desc' },
      include: {
        _count: {
          select: {
            productCaches: true,
            variantMaps: true,
            sourceLogs: true,
          },
        },
      },
    });

    const enrichedStores = stores.map((s: any) => ({
      id: s.id,
      shopDomain: s.shopDomain,
      label: s.label,
      masterLabel: s.masterLabel,
      isMaster: s.isMaster,
      isActive: s.isActive && hasValidShopifyAccessToken(s.accessToken),
      scope: s.scope,
      productCount: s._count.productCaches,
      variantCount: s._count.variantMaps,
      syncCount: s._count.sourceLogs,
      priceAdjustmentValue: s.priceAdjustmentValue,
      priceAdjustmentType: s.priceAdjustmentType,
      isPriceAdjustmentEnabled: s.isPriceAdjustmentEnabled,
    }));

    return NextResponse.json({
      success: true,
      total: enrichedStores.length,
      stores: enrichedStores,
    });
  } catch (error: any) {
    console.error('[Stores API] Error:', error);
    return handleApiError(error);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { store } = await authenticate(req);
    const body = await req.json();
    const { stores } = body;

    if (!Array.isArray(stores)) {
      return NextResponse.json({ success: false, error: "Invalid payload: stores must be an array" }, { status: 400 });
    }

    // Verify ownership/access before updating
    const connections = await (prisma as any).storeConnection.findMany({
      where: { sourceStoreId: store.id }
    });
    const authorizedStoreIds = new Set([store.id, ...connections.map((c: any) => c.targetStoreId)]);

    const updates = stores.map((s: any) => {
      if (!authorizedStoreIds.has(s.id)) {
        throw new Error(`Unauthorized to update store ${s.id}`);
      }
      return prisma.store.update({
        where: { id: s.id },
        data: {
          priceAdjustmentValue: typeof s.priceAdjustmentValue === 'number' ? s.priceAdjustmentValue : 0,
          priceAdjustmentType: s.priceAdjustmentType || 'PERCENTAGE',
          isPriceAdjustmentEnabled: typeof s.isPriceAdjustmentEnabled === 'boolean' ? s.isPriceAdjustmentEnabled : false,
        },
      });
    });

    await prisma.$transaction(updates);

    // Apply the price adjustments to the Shopify stores in the background
    // We don't await this so the UI returns immediately.
    Promise.all(stores.map(async (s: any) => {
      try {
        await applyPriceAdjustmentToStore(s.id);
      } catch (adjustErr: any) {
        console.error(`[Stores API] Failed to apply bulk price adjustments for store ${s.id}:`, adjustErr.message);
      }
    })).catch(console.error);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[Stores API] Put error:', error);
    return handleApiError(error);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await authenticate(req);
    const shop = req.nextUrl.searchParams.get('shop');
    if (!shop) {
      return NextResponse.json({ error: 'Missing shop parameter' }, { status: 400 });
    }

    const store = await prisma.store.findUnique({ where: { shopDomain: shop } });
    if (!store) {
      return NextResponse.json({ error: `Store ${shop} not found` }, { status: 404 });
    }

    if (store.isMaster) {
      return NextResponse.json({ success: false, error: 'Cannot delete the master store. Please assign another master store first.' }, { status: 400 });
    }

    await prisma.$transaction([
      prisma.productCache.deleteMany({ where: { storeId: store.id } }),
      prisma.variantMap.deleteMany({ where: { storeId: store.id } }),
      prisma.session.deleteMany({ where: { shop } }),
      prisma.store.update({ where: { id: store.id }, data: { isActive: false } }),
    ]);

    console.log(`[Stores API] Store ${shop} deactivated and data cleared`);
    return NextResponse.json({ success: true, message: `Store ${shop} deactivated` });
  } catch (error: any) {
    console.error('[Stores API] Delete error:', error);
    return handleApiError(error);
  }
}
