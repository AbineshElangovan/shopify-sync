import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

import { hasValidShopifyAccessToken, applyPriceAdjustmentToStore } from '@/services/shopify';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const activeOnly = searchParams.get('active') !== 'false';

    const stores = await prisma.store.findMany({
      where: activeOnly ? { isActive: true } : undefined,
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

    const enrichedStores = stores.map((s) => ({
      id: s.id,
      shopDomain: s.shopDomain,
      label: s.label,
      isActive: s.isActive && hasValidShopifyAccessToken(s.accessToken),
      scope: s.scope,
      installedAt: s.installedAt,
      updatedAt: s.updatedAt,
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
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { stores } = body;

    if (!Array.isArray(stores)) {
      return NextResponse.json({ success: false, error: "Invalid payload: stores must be an array" }, { status: 400 });
    }

    const updates = stores.map((s: any) =>
      prisma.store.update({
        where: { id: s.id },
        data: {
          priceAdjustmentValue: typeof s.priceAdjustmentValue === 'number' ? s.priceAdjustmentValue : 0,
          priceAdjustmentType: s.priceAdjustmentType || 'PERCENTAGE',
          isPriceAdjustmentEnabled: typeof s.isPriceAdjustmentEnabled === 'boolean' ? s.isPriceAdjustmentEnabled : false,
        },
      })
    );

    await prisma.$transaction(updates);

    // Apply the price adjustments to the Shopify stores and local cache
    for (const s of stores) {
      try {
        await applyPriceAdjustmentToStore(s.id);
      } catch (adjustErr: any) {
        console.error(`[Stores API] Failed to apply bulk price adjustments for store ${s.id}:`, adjustErr.message);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[Stores API] Put error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const shop = req.nextUrl.searchParams.get('shop');
    if (!shop) {
      return NextResponse.json({ error: 'Missing shop parameter' }, { status: 400 });
    }

    const store = await prisma.store.findUnique({ where: { shopDomain: shop } });
    if (!store) {
      return NextResponse.json({ error: `Store ${shop} not found` }, { status: 404 });
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
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
