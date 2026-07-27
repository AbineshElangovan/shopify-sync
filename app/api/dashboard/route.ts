import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { authenticate, handleApiError } from '@/lib/shopify/authenticate';
import { hasValidShopifyAccessToken } from '@/services/shopify/utils';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { store } = await authenticate(req);
    
    // 1. Fetch authorized connections for THIS store only
    const connections = await (prisma as any).storeConnection.findMany({
      where: { sourceStoreId: store.id }
    });
    const connectedStoreIds = connections.map((c: any) => c.targetStoreId);
    const visibleStoreIds = [store.id, ...connectedStoreIds];

    // 2. Fetch data ONLY for authorized stores
    const [productCaches, totalSyncs, successSyncs, latestSync, allStores] = await Promise.all([
      prisma.productCache.findMany({ 
        where: { storeId: { in: visibleStoreIds } },
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }] 
      }),
      prisma.syncLog.count({ where: { sourceStoreId: store.id } }),
      prisma.syncLog.count({ where: { sourceStoreId: store.id, status: 'SUCCESS' } }),
      prisma.syncLog.findFirst({
        where: { sourceStoreId: store.id },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.store.findMany({ 
        where: { id: { in: visibleStoreIds }, isActive: true } 
      })
    ]);

    let lastUpdated = 'Never';
    if (latestSync) {
      const diffMins = Math.floor((Date.now() - latestSync.createdAt.getTime()) / 60000);
      lastUpdated =
        diffMins < 1 ? 'Just now' : diffMins < 60 ? `${diffMins} mins ago` : `${Math.floor(diffMins / 60)} hrs ago`;
    }

    // Current store metrics
    const rawCurrentStoreProducts = productCaches.filter((p: any) => p.storeId === store.id);
    
    // Clean up stale parent products (default variants) if real variants exist
    const productsByParent = new Map();
    for (const p of rawCurrentStoreProducts) {
      if (!productsByParent.has(p.shopifyProductId)) {
        productsByParent.set(p.shopifyProductId, []);
      }
      productsByParent.get(p.shopifyProductId).push(p);
    }

    const currentStoreProducts: any[] = [];
    for (const p of rawCurrentStoreProducts) {
      const siblings = productsByParent.get(p.shopifyProductId);
      // If there are multiple variants for this product, and this row's title doesn't contain ' - ', it's the stale parent
      if (siblings.length > 1 && !p.title.includes(' - ')) {
        continue;
      }
      currentStoreProducts.push(p);
    }

    const totalProducts = new Set(currentStoreProducts.map((p: any) => p.shopifyProductId)).size;
    const totalInventory = currentStoreProducts.reduce((a: any, p: any) => a + p.inventoryQuantity, 0);
    const activeProducts = new Set(
      currentStoreProducts.filter((p: any) => p.inventoryQuantity > 0).map((p: any) => p.shopifyProductId)
    ).size;
    const lowStockCount = currentStoreProducts.filter((p: any) => p.inventoryQuantity <= store.lowStockThreshold).length;

    const stats = { totalProducts, totalInventory, activeProducts, lowStock: lowStockCount, lastUpdated };

    const storesWithProducts = allStores.map((s: any) => {
      const storeSpecificProducts = productCaches.filter((p: any) => p.storeId === s.id);
      return {
        id: s.id,
        shopDomain: s.shopDomain,
        label: s.label || s.shopDomain,
        isActive: s.isActive,
        productCount: new Set(storeSpecificProducts.map((p: any) => p.shopifyProductId)).size,
        inventoryTotal: storeSpecificProducts.reduce((acc: any, p: any) => acc + p.inventoryQuantity, 0),
        salesValue: storeSpecificProducts.reduce((acc: any, p: any) => acc + (p.price * p.inventoryQuantity), 0),
        activeProductCount: new Set(
          storeSpecificProducts.filter((p: any) => p.inventoryQuantity > 0).map((p: any) => p.shopifyProductId)
        ).size,
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
    return handleApiError(error);
  }
}
