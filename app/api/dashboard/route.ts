import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { authenticate } from '@/lib/shopify/authenticate';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { store } = await authenticate(req);

    // Fetch data for all stores to combine inventory
    const [productCaches, totalSyncs, successSyncs, latestSync, allStores] = await Promise.all([
      prisma.productCache.findMany({ orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }] }),
      prisma.syncLog.count(),
      prisma.syncLog.count({ where: { status: 'SUCCESS' } }),
      prisma.syncLog.findFirst({
        orderBy: { createdAt: 'desc' }
      }),
      prisma.store.findMany({ where: { isActive: true } }),
    ]);

    let lastUpdated = 'Never';
    if (latestSync) {
      const diffMins = Math.floor((Date.now() - latestSync.createdAt.getTime()) / 60000);
      lastUpdated =
        diffMins < 1 ? 'Just now' : diffMins < 60 ? `${diffMins} mins ago` : `${Math.floor(diffMins / 60)} hrs ago`;
    }

    const currentStoreProducts = productCaches.filter(p => p.storeId === store.id);

    // Group current store products by SKU to prevent null-SKU products from merging
    const deduplicatedCurrentStoreProducts = Array.from(
      currentStoreProducts.reduce((map, p) => {
        const key = p.sku ? p.sku : p.id; 
        const existing = map.get(key);
        if (!existing) {
          map.set(key, { ...p });
        } else {
          existing.inventoryQuantity += p.inventoryQuantity;
          if (!existing.imageUrl && p.imageUrl) {
            existing.imageUrl = p.imageUrl;
          }
          map.set(key, existing);
        }
        return map;
      }, new Map()).values()
    ) as typeof productCaches;

    const totalProducts = deduplicatedCurrentStoreProducts.length;
    const totalInventory = deduplicatedCurrentStoreProducts.reduce((a, p) => a + p.inventoryQuantity, 0);
    const activeProducts = deduplicatedCurrentStoreProducts.filter((p) => p.inventoryQuantity > 0).length;
    const lowStockCount = deduplicatedCurrentStoreProducts.filter((p) => p.inventoryQuantity <= store.lowStockThreshold).length;

    const stats = { totalProducts, totalInventory, activeProducts, lowStock: lowStockCount, lastUpdated };

    const storesWithProducts = allStores.map(s => {
      const storeSpecificProducts = productCaches.filter(p => p.storeId === s.id);
      return {
        id: s.id,
        shopDomain: s.shopDomain,
        label: s.label || s.shopDomain,
        isActive: s.isActive,
        installedAt: s.installedAt,
        productCount: storeSpecificProducts.length,
        inventoryTotal: storeSpecificProducts.reduce((acc, p) => acc + p.inventoryQuantity, 0),
        salesValue: storeSpecificProducts.reduce((acc, p) => acc + (p.price * p.inventoryQuantity), 0),
        activeProductCount: storeSpecificProducts.filter(p => p.inventoryQuantity > 0).length,
      };
    });

    const failedSyncs = totalSyncs - successSyncs;
    const syncStats = { totalSyncs, successSyncs, failedSyncs };

    // Also compute cross-store deduplicated products for the "Recently Added" table
    const deduplicatedAllProducts = Array.from(
      productCaches.reduce((map, p) => {
        const key = p.sku ? p.sku : p.id;
        const existing = map.get(key);
        if (!existing) {
          map.set(key, { ...p, imageUrls: p.imageUrl ? [p.imageUrl] : [] });
        } else {
          existing.inventoryQuantity += p.inventoryQuantity;
          if (p.imageUrl && !existing.imageUrls.includes(p.imageUrl)) {
            existing.imageUrls.push(p.imageUrl);
          }
          // Set the primary imageUrl to the first one just for backward compatibility
          existing.imageUrl = existing.imageUrls[0] || null;
          map.set(key, existing);
        }
        return map;
      }, new Map()).values()
    ) as typeof productCaches & { imageUrls: string[] }[];

    // Filter low stock using current store's threshold settings (combined inventory)
    const lowStockProducts = deduplicatedAllProducts
      .filter((p) => p.inventoryQuantity <= store.lowStockThreshold)
      .sort((a, b) => a.inventoryQuantity - b.inventoryQuantity)
      .slice(0, 50);

    const recentlyAddedProducts = deduplicatedAllProducts.slice(0, 50);

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
