import { NextRequest, NextResponse } from "next/server";
import { authenticate } from "@/lib/shopify/authenticate";
import { prisma } from "@/lib/db/prisma";
import { syncStoreProducts } from "@/services/shopify";

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { store } = await authenticate(req);
    
    // Fetch store-specific products with collections
    const products = await prisma.productCache.findMany({
      where: { storeId: store.id },
      orderBy: { updatedAt: 'desc' },
      include: {
        store: true,
        collections: {
          include: {
            collection: true,
          }
        }
      }
    });

    const totalProducts = products.length;
    const totalInventory = products.reduce((sum, p) => sum + p.inventoryQuantity, 0);
    const activeProducts = products.filter((p) => p.inventoryQuantity > 0).length;
    const lowStock = products.filter((p) => p.inventoryQuantity <= store.lowStockThreshold).length;

    // Group products by collection
    const groupedProducts: { [collectionTitle: string]: any[] } = {};

    const skuImages: { [sku: string]: string[] } = {};
    products.forEach((p) => {
      if (p.sku && p.imageUrl) {
        if (!skuImages[p.sku]) skuImages[p.sku] = [];
        if (!skuImages[p.sku].includes(p.imageUrl)) {
          skuImages[p.sku].push(p.imageUrl);
        }
      }
    });

    // Cross-store collection fallback logic
    const currentSkus = products.map(p => p.sku).filter(Boolean) as string[];
    const crossStoreProducts = await prisma.productCache.findMany({
      where: { sku: { in: currentSkus }, collections: { some: {} } },
      include: { collections: { include: { collection: true } } }
    });

    const skuCategories: { [sku: string]: string[] } = {};
    crossStoreProducts.forEach(p => {
      if (p.sku && p.collections) {
        if (!skuCategories[p.sku]) skuCategories[p.sku] = [];
        p.collections.forEach(cp => {
           if (!skuCategories[p.sku!].includes(cp.collection.title)) {
             skuCategories[p.sku!].push(cp.collection.title);
           }
        });
      }
    });

    products.forEach((p) => {
      const item = {
        id: p.id,
        shopifyProductId: p.shopifyProductId,
        imageUrls: (p.sku && skuImages[p.sku]?.length > 0) ? skuImages[p.sku] : (p.imageUrl ? [p.imageUrl] : []),
        title: p.title,
        sku: p.sku || 'N/A',
        store: p.store.label || p.store.shopDomain,
        price: p.price,
        priceText: `₹${(p.price).toFixed(2)}`,
        inventoryQuantity: p.inventoryQuantity,
        stockLevel:
          p.inventoryQuantity === 0
            ? 'Out of Stock'
            : p.inventoryQuantity <= 5
            ? 'Critical'
            : p.inventoryQuantity <= store.lowStockThreshold
            ? 'Low'
            : 'Healthy',
        status: p.inventoryQuantity > 0 ? 'Active' : 'Inactive',
        updatedDate: p.updatedAt.toLocaleDateString('en-US'),
        updatedTime: p.updatedAt.toLocaleTimeString('en-US'),
      };

      let categoryTitles: string[] = [];
      
      if (p.collections && p.collections.length > 0) {
        categoryTitles = p.collections.map(cp => cp.collection.title);
      } else if (p.sku && skuCategories[p.sku] && skuCategories[p.sku].length > 0) {
        categoryTitles = skuCategories[p.sku];
      } else {
        categoryTitles = ['Uncategorized'];
      }

        // Deduplicate category titles to prevent pushing the same item multiple times
      categoryTitles = Array.from(new Set(categoryTitles));

      categoryTitles.forEach((title) => {
        if (!groupedProducts[title]) {
          groupedProducts[title] = [];
        }
        
        // Group by SKU if available, otherwise fallback to the shopify product ID so variants of the same product merge
        const existingItem = groupedProducts[title].find((i: any) => 
          (item.sku !== 'N/A' && i.sku === item.sku) || 
          (item.sku === 'N/A' && i.shopifyProductId === p.shopifyProductId)
        );
        
        if (existingItem) {
          // Aggregate inventory quantity
          existingItem.inventoryQuantity += item.inventoryQuantity;
          
          // Re-evaluate stock level and status
          existingItem.stockLevel =
            existingItem.inventoryQuantity === 0
              ? 'Out of Stock'
              : existingItem.inventoryQuantity <= 5
              ? 'Critical'
              : existingItem.inventoryQuantity <= store.lowStockThreshold
              ? 'Low'
              : 'Healthy';
          existingItem.status = existingItem.inventoryQuantity > 0 ? 'Active' : 'Inactive';
        } else {
          groupedProducts[title].push(item);
        }
      });
    });

    return NextResponse.json({
      success: true,
      stats: {
        totalProducts,
        totalInventory,
        activeProducts,
        lowStock,
      },
      lowStockThreshold: store.lowStockThreshold,
      groupedProducts,
    });
  } catch (err: any) {
    console.error("[Products API] Error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
