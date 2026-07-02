import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

/**
 * GET /api/stores
 *
 * Returns all registered stores with their product and sync statistics.
 * Used by the dashboard and settings pages to display connected stores.
 */
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const activeOnly = searchParams.get('active') !== 'false'; // default: only active stores

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
      isActive: s.isActive,
      scope: s.scope,
      installedAt: s.installedAt,
      updatedAt: s.updatedAt,
      productCount: s._count.productCaches,
      variantCount: s._count.variantMaps,
      syncCount: s._count.sourceLogs,
      // Never expose accessToken in API responses
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

/**
 * DELETE /api/stores?shop=<domain>
 *
 * Marks a store as inactive and clears its product cache and variant maps.
 * Does NOT delete the store record itself (keeps audit history).
 */
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
