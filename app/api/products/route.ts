import { NextRequest, NextResponse } from "next/server";
import { authenticate } from "@/lib/shopify/authenticate";
import { prisma } from "@/lib/db/prisma";
import { syncStoreProducts } from "@/services/shopify";

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { store } = await authenticate(req);
    
    // Trigger product and inventory sync
    try {
      await syncStoreProducts(store.shopDomain);
    } catch (syncErr: any) {
      console.error("[Products API] Sync error:", syncErr.message);
    }

    // Fetch store-specific products with collections
    const products = await prisma.productCache.findMany({
      where: { storeId: store.id },
      orderBy: { updatedAt: 'desc' },
      include: {
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

    products.forEach((p) => {
      const item = {
        id: p.id,
        imageUrl: p.imageUrl,
        title: p.title,
        sku: p.sku || 'N/A',
        store: store.label || store.shopDomain,
        price: p.price * 83,
        priceText: `₹${(p.price * 83).toFixed(2)}`,
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

      if (p.collections && p.collections.length > 0) {
        p.collections.forEach((cp) => {
          const title = cp.collection.title;
          if (!groupedProducts[title]) {
            groupedProducts[title] = [];
          }
          groupedProducts[title].push(item);
        });
      } else {
        const title = 'Uncategorized';
        if (!groupedProducts[title]) {
          groupedProducts[title] = [];
        }
        groupedProducts[title].push(item);
      }
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
