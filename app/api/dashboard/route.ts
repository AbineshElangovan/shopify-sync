import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { authenticate } from '@/lib/shopify/authenticate';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { store } = await authenticate(req);

    // Fetch store-specific data
    const [productCaches, totalSyncs, successSyncs, latestSync] = await Promise.all([
      prisma.productCache.findMany({ where: { storeId: store.id }, orderBy: { updatedAt: 'desc' } }),
      prisma.syncLog.count({ where: { OR: [{ sourceStoreId: store.id }, { destinationStoreId: store.id }] } }),
      prisma.syncLog.count({ where: { OR: [{ sourceStoreId: store.id }, { destinationStoreId: store.id }], status: 'SUCCESS' } }),
      prisma.syncLog.findFirst({
        where: { OR: [{ sourceStoreId: store.id }, { destinationStoreId: store.id }] },
        orderBy: { createdAt: 'desc' }
      }),
    ]);

    let lastUpdated = 'Never';
    if (latestSync) {
      const diffMins = Math.floor((Date.now() - latestSync.createdAt.getTime()) / 60000);
      lastUpdated =
        diffMins < 1 ? 'Just now' : diffMins < 60 ? `${diffMins} mins ago` : `${Math.floor(diffMins / 60)} hrs ago`;
    }

    const totalProducts = productCaches.length;
    const totalInventory = productCaches.reduce((a, p) => a + p.inventoryQuantity, 0);
    const activeProducts = productCaches.filter((p) => p.inventoryQuantity > 0).length;
    const lowStockCount = productCaches.filter((p) => p.inventoryQuantity <= store.lowStockThreshold).length;

    const stats = { totalProducts, totalInventory, activeProducts, lowStock: lowStockCount, lastUpdated };

    const storesWithProducts = [
      {
        id: store.id,
        shopDomain: store.shopDomain,
        label: store.label || store.shopDomain,
        isActive: store.isActive,
        installedAt: store.installedAt,
        productCount: totalProducts,
        inventoryTotal: totalInventory,
        salesValue: totalInventory * 500,
        activeProductCount: activeProducts,
        totalSyncs,
        successSyncs,
        syncRate: totalSyncs > 0 ? Math.round((successSyncs / totalSyncs) * 100) : null,
      }
    ];

    const failedSyncs = totalSyncs - successSyncs;
    const syncStats = { totalSyncs, successSyncs, failedSyncs };

    // Filter low stock using current store's threshold settings
    const lowStockProducts = productCaches
      .filter((p) => p.inventoryQuantity <= store.lowStockThreshold)
      .sort((a, b) => a.inventoryQuantity - b.inventoryQuantity)
      .slice(0, 50);

    const recentlyAddedProducts = productCaches.slice(0, 50);

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
