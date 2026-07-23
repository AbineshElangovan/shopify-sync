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
      where: { 
        sku: { in: currentSkus },
        OR: [
          { collections: { some: {} } },
          { tags: { not: null } }
        ]
      },
      include: { collections: { include: { collection: true } } }
    });

    const skuCategories: { [sku: string]: string[] } = {};
    
    crossStoreProducts.forEach(p => {
      if (p.sku) {
        if (!skuCategories[p.sku]) skuCategories[p.sku] = [];
        
        if (p.collections) {
          p.collections.forEach(cp => {
             if (!skuCategories[p.sku!].includes(cp.collection.title)) {
               skuCategories[p.sku!].push(cp.collection.title);
             }
          });
        }
        
        if (p.tags) {
          const tagList = p.tags.split(',').map((t: string) => t.trim().toUpperCase()).filter(Boolean);
          
          tagList.forEach(tag => {
            // Case-insensitive deduplication
            const existing = skuCategories[p.sku!].map(c => c.toUpperCase());
            if (!existing.includes(tag)) {
              skuCategories[p.sku!].push(tag);
            }
          });
        }
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
      
      const TAG_MAP: Record<string, string> = {
        'inner': 'INNERS',
        'inners': 'INNERS',
        'pants': 'PANTS',
        'shirts': 'SHIRTS',
        't-shirt': 'T-SHIRTS',
        'accessories': 'MENS ACCESSORIES',
        'shoes': 'SHOES',
        'socks': 'SOCKS',
        'trousers': 'TROUSERS',
      };
      
      if (p.collections && p.collections.length > 0) {
        categoryTitles = categoryTitles.concat(p.collections.map(cp => cp.collection.title));
      }
      if (p.sku && skuCategories[p.sku] && skuCategories[p.sku].length > 0) {
        categoryTitles = categoryTitles.concat(skuCategories[p.sku]);
      }
      if (p.tags) {
        const tagList = p.tags.split(',').map((t: string) => t.trim().toUpperCase()).filter(Boolean);
        
        // Deduplicate tags that match existing collections case-insensitively
        const existingUpperCategories = categoryTitles.map(c => c.toUpperCase());
        for (const tag of tagList) {
          if (!existingUpperCategories.includes(tag)) {
            categoryTitles.push(tag);
            existingUpperCategories.push(tag); // Prevent duplicates within tags themselves
          }
        }
      }
      
      if (categoryTitles.length === 0) {
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
