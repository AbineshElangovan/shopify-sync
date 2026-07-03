import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { hasValidShopifyAccessToken } from '@/services/shopify';

/**
 * GET /api/dashboard
 *
 * Returns the full dashboard payload as JSON.
 * Used by any client-side component that needs fresh data without a full page reload.
 *
 * Response shape:
 *   { stats, stores, lowStockProducts, recentlyAddedProducts, syncStats }
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // ── Stores ──────────────────────────────────────────────────────────────
    const activeStores = await prisma.store.findMany({ where: { isActive: true } });
    const validStores = activeStores.filter((s) => hasValidShopifyAccessToken(s.accessToken));
    const validStoreIds = validStores.map((s) => s.id);
    const productCacheWhere =
      validStoreIds.length > 0
        ? { storeId: { in: validStoreIds } }
        : { id: { in: [] as string[] } };

    // ── Statistics ───────────────────────────────────────────────────────────
    const [totalProducts, invResult, activeProducts, lowStockCount, latestSync] =
      await Promise.all([
        prisma.productCache.count({ where: productCacheWhere }),
        prisma.productCache.aggregate({ where: productCacheWhere, _sum: { inventoryQuantity: true } }),
        prisma.productCache.count({ where: { ...productCacheWhere, inventoryQuantity: { gt: 0 } } }),
        prisma.productCache.count({ where: { ...productCacheWhere, inventoryQuantity: { lte: 15 } } }),
        prisma.syncLog.findFirst({ orderBy: { createdAt: 'desc' } }),
      ]);

    const totalInventory = invResult._sum.inventoryQuantity ?? 0;

    let lastUpdated = 'Never';
    if (latestSync) {
      const diffMins = Math.floor((Date.now() - latestSync.createdAt.getTime()) / 60000);
      lastUpdated =
        diffMins < 1 ? 'Just now' : diffMins < 60 ? `${diffMins} mins ago` : `${Math.floor(diffMins / 60)} hrs ago`;
    }

    const stats = { totalProducts, totalInventory, activeProducts, lowStock: lowStockCount, lastUpdated };

    // ── Per-store data ───────────────────────────────────────────────────────
    const storesWithProducts = await Promise.all(
      validStores.map(async (store) => {
        const [productCaches, totalSyncs, successSyncs] = await Promise.all([
          prisma.productCache.findMany({ where: { storeId: store.id }, orderBy: { updatedAt: 'desc' } }),
          prisma.syncLog.count({ where: { sourceStoreId: store.id } }),
          prisma.syncLog.count({ where: { sourceStoreId: store.id, status: 'SUCCESS' } }),
        ]);
        const inventory = productCaches.reduce((a, p) => a + p.inventoryQuantity, 0);
        return {
          id: store.id,
          shopDomain: store.shopDomain,
          label: store.label,
          isActive: store.isActive,
          installedAt: store.installedAt,
          productCount: productCaches.length,
          inventoryTotal: inventory,
          salesValue: inventory * 500,
          activeProductCount: productCaches.filter((p) => p.inventoryQuantity > 0).length,
          totalSyncs,
          successSyncs,
          syncRate: totalSyncs > 0 ? Math.round((successSyncs / totalSyncs) * 100) : null,
        };
      })
    );

    // ── Sync stats ───────────────────────────────────────────────────────────
    const [totalSyncs, successSyncs, failedSyncs, webhookEventCount] = await Promise.all([
      prisma.syncLog.count(),
      prisma.syncLog.count({ where: { status: 'SUCCESS' } }),
      prisma.syncLog.count({ where: { status: 'FAILED' } }),
      prisma.webhookEvent.count(),
    ]);

    const syncStats = { totalSyncs, successSyncs, failedSyncs, webhookEventCount };

    // ── Low stock products ────────────────────────────────────────────────────
    const lowStockProducts = await prisma.productCache.findMany({
      where: { ...productCacheWhere, inventoryQuantity: { lte: 15 } },
      orderBy: { inventoryQuantity: 'asc' },
      take: 50,
    });

    // ── Recently added products ───────────────────────────────────────────────
    const recentlyAddedProducts = await prisma.productCache.findMany({
      where: productCacheWhere,
      orderBy: { updatedAt: 'desc' },
      take: 50,
    });

    return NextResponse.json({
      success: true,
      stats,
      stores: storesWithProducts,
      syncStats,
      lowStockProducts,
      recentlyAddedProducts,
    });
  } catch (error: any) {
    console.error('[Dashboard API] Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
