import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { authenticate } from '@/lib/shopify/authenticate';
import { hasValidShopifyAccessToken } from '@/services/shopify/utils';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { store } = await authenticate(req);
    
    // Fetch data for all stores to combine inventory
    const [productCaches, totalSyncs, successSyncs, latestSync, allStores, connections] = await Promise.all([
      prisma.productCache.findMany({ orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }] }),
      prisma.syncLog.count(),
      prisma.syncLog.count({ where: { status: 'SUCCESS' } }),
      prisma.syncLog.findFirst({
        orderBy: { createdAt: 'desc' }
      }),
      prisma.store.findMany({ where: { isActive: true } }),
      // @ts-ignore - bypassing stale Prisma client cache
      (prisma as any).storeConnection.findMany()
    ]);

    let lastUpdated = 'Never';
    if (latestSync) {
      const diffMins = Math.floor((Date.now() - latestSync.createdAt.getTime()) / 60000);
      lastUpdated =
        diffMins < 1 ? 'Just now' : diffMins < 60 ? `${diffMins} mins ago` : `${Math.floor(diffMins / 60)} hrs ago`;
    }

    // Group ALL store products by SKU to prevent null-SKU products from merging
    const currentStoreProducts = productCaches.filter((p: any) => p.storeId === store.id);
    const totalProducts = currentStoreProducts.length;
    const totalInventory = currentStoreProducts.reduce((a: any, p: any) => a + p.inventoryQuantity, 0);
    const activeProducts = currentStoreProducts.filter((p: any) => p.inventoryQuantity > 0).length;
    const lowStockCount = currentStoreProducts.filter((p: any) => p.inventoryQuantity <= store.lowStockThreshold).length;

    const stats = { totalProducts, totalInventory, activeProducts, lowStock: lowStockCount, lastUpdated };

    const connectedStoreIds = new Set(connections.map((c: any) => c.targetStoreId));
    const visibleStores = allStores.filter((s: any) => 
      s.id === store.id || 
      s.shopDomain === 'eshan-inventory-solutions.myshopify.com' || 
      s.shopDomain === 'eshan-coimbatore-store-8jjdfk4t.myshopify.com' || 
      connectedStoreIds.has(s.id)
    );

    const storesWithProducts = visibleStores.map((s: any) => {
      const storeSpecificProducts = productCaches.filter((p: any) => p.storeId === s.id);
      return {
        id: s.id,
        shopDomain: s.shopDomain,
        label: s.label || s.shopDomain,
        isActive: s.isActive,
        installedAt: s.installedAt,
        productCount: storeSpecificProducts.length,
        inventoryTotal: storeSpecificProducts.reduce((acc: any, p: any) => acc + p.inventoryQuantity, 0),
        salesValue: storeSpecificProducts.reduce((acc: any, p: any) => acc + (p.price * p.inventoryQuantity), 0),
        activeProductCount: storeSpecificProducts.filter((p: any) => p.inventoryQuantity > 0).length,
      };
    });

    const failedSyncs = totalSyncs - successSyncs;
    const syncStats = { totalSyncs, successSyncs, failedSyncs };


    // Filter low stock using current store's threshold settings
    const lowStockProducts = currentStoreProducts
      .filter((p: any) => p.inventoryQuantity <= store.lowStockThreshold)
      .sort((a: any, b: any) => a.inventoryQuantity - b.inventoryQuantity)
      .slice(0, 50);

    const recentlyAddedProducts = currentStoreProducts
      .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 50);

    return NextResponse.json({
      success: true,
      currentStoreId: store.id,
      stores: storesWithProducts,
      stats,
      syncStats,
      lowStockProducts,
      recentlyAddedProducts,
      lowStockThreshold: store.lowStockThreshold,
    });
  } catch (error: any) {
    console.error('[Dashboard API] Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
