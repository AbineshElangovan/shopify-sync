import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { syncStoreProducts, hasValidShopifyAccessToken } from '@/lib/shopify/sync-service';

/**
 * POST /api/sync-products
 * Manually triggers product sync for all active stores (or a specific shop).
 * This is called by the "Sync Now" button on the dashboard.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const targetShop: string | undefined = body?.shop;

    const storeQuery = targetShop
      ? { shopDomain: targetShop, isActive: true }
      : { isActive: true };

    const stores = await prisma.store.findMany({ where: storeQuery });
    const validStores = stores.filter((s) => hasValidShopifyAccessToken(s.accessToken));

    if (validStores.length === 0) {
      return NextResponse.json(
        { error: 'No active stores with valid tokens found.' },
        { status: 404 }
      );
    }

    const results = await Promise.allSettled(
      validStores.map((store) => syncStoreProducts(store.shopDomain))
    );

    const summary = results.map((r, i) => ({
      shop: validStores[i].shopDomain,
      status: r.status,
      ...(r.status === 'fulfilled' ? { result: r.value } : { error: (r as PromiseRejectedResult).reason?.message }),
    }));

    console.log('[SyncProducts] Manual sync completed', summary);
    return NextResponse.json({ success: true, results: summary });
  } catch (error: any) {
    console.error('[SyncProducts] Manual sync failed', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * GET /api/sync-products
 * Returns the current product cache count per store (useful for status checks).
 */
export async function GET() {
  try {
    const stores = await prisma.store.findMany({
      where: { isActive: true },
      include: { _count: { select: { productCaches: true, variantMaps: true } } },
    });

    return NextResponse.json({
      stores: stores.map((s) => ({
        shopDomain: s.shopDomain,
        label: s.label,
        isActive: s.isActive,
        productCacheCount: s._count.productCaches,
        variantMapCount: s._count.variantMaps,
      })),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
