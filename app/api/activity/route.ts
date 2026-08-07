import { NextRequest, NextResponse } from "next/server";
import { authenticate, handleApiError } from "@/lib/shopify/authenticate";
import { prisma } from "@/lib/db/prisma";

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { store } = await authenticate(req);
    const searchParams = req.nextUrl.searchParams;
    const search = searchParams.get('search') || '';
    const collection = searchParams.get('collection') || '';
    const filterStoreId = searchParams.get('storeId') || ''; 
    const dateRange = searchParams.get('dateRange') || 'all';
    const isExport = searchParams.get('export') === 'true';
    
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '15', 10);
    const skip = (page - 1) * limit;

    let allowedStoreIds: string[] = [];
    let isMultiStore = false;

    // 1. Find the Master Store ID for this network
    let masterStoreId = store.id;
    if (!store.isMaster) {
      const parentConnection = await (prisma as any).storeConnection.findFirst({
         where: { targetStoreId: store.id }
      });
      if (parentConnection) {
        masterStoreId = parentConnection.sourceStoreId;
      }
    }

    // 2. Find ALL stores in this network (Master + all connected stores)
    const connections = await (prisma as any).storeConnection.findMany({
      where: { sourceStoreId: masterStoreId }
    });
    
    allowedStoreIds = [masterStoreId, ...connections.map((c: any) => c.targetStoreId)];
    isMultiStore = connections.length > 0;

    let storeIdsToQuery = allowedStoreIds;
    if (filterStoreId && filterStoreId !== 'all') {
      if (allowedStoreIds.includes(filterStoreId)) {
        storeIdsToQuery = [filterStoreId];
      }
    }

    const whereClause: any = {
      storeId: { in: storeIdsToQuery }
    };

    if (search) {
      whereClause.OR = [
        { productTitle: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (collection && collection !== 'all') {
      whereClause.collection = { contains: collection, mode: 'insensitive' };
    }

    if (dateRange !== 'all') {
      const now = new Date();
      let startDate = new Date();
      if (dateRange === 'today') {
        startDate.setHours(0, 0, 0, 0);
      } else if (dateRange === 'week') {
        startDate.setDate(now.getDate() - 7);
      } else if (dateRange === 'month') {
        startDate.setMonth(now.getMonth() - 1);
      }
      whereClause.createdAt = { gte: startDate };
    }

    // Auto-delete logs older than 90 days if enabled for the master store
    try {
      const masterSettings = await (prisma.storeSetting as any).findUnique({ where: { storeId: masterStoreId } });
      if (!masterSettings || masterSettings.dataRetentionEnabled) {
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
        
        await prisma.activityLog.deleteMany({
          where: {
            storeId: { in: allowedStoreIds },
            createdAt: { lt: ninetyDaysAgo }
          }
        });
      }
    } catch (cleanupErr) {
      console.error("[Activity API] Error cleaning up old logs:", cleanupErr);
    }

    const [activities, totalActivities] = await Promise.all([
      prisma.activityLog.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        include: {
          store: {
            select: { id: true, label: true, shopDomain: true, isMaster: true }
          }
        },
        take: isExport ? undefined : limit,
        skip: isExport ? undefined : skip
      }),
      prisma.activityLog.count({ where: whereClause })
    ]);
    
    // Attach product images from ProductCache
    const productIds = activities.map(a => a.productId).filter(Boolean) as string[];
    const skus = activities.map(a => a.sku).filter(Boolean) as string[];
    
    let enrichedActivities = activities;
    if (productIds.length > 0 || skus.length > 0) {
      const productCaches = await prisma.productCache.findMany({
        where: {
          OR: [
            { shopifyProductId: { in: productIds } },
            { sku: { in: skus } }
          ]
        },
        select: { shopifyProductId: true, sku: true, imageUrl: true }
      });
      
      const imageUrlMap = new Map<string, string>();
      productCaches.forEach((pc: any) => {
         if (pc.imageUrl) {
           if (pc.shopifyProductId) imageUrlMap.set(pc.shopifyProductId, pc.imageUrl);
           if (pc.sku) imageUrlMap.set(pc.sku, pc.imageUrl);
         }
      });
      
      enrichedActivities = activities.map((a: any) => ({
        ...a,
        imageUrl: (a.productId && imageUrlMap.get(a.productId)) || (a.sku && imageUrlMap.get(a.sku)) || null
      })) as any;
    }
    
    let storeOptions: any[] = [];
    if (isMultiStore) {
        const stores = await prisma.store.findMany({
            where: { id: { in: allowedStoreIds } },
            select: { id: true, label: true, shopDomain: true }
        });
        storeOptions = stores.map((s: any) => ({
            label: s.label || s.shopDomain,
            value: s.id
        }));
    }

    const collections = await prisma.collection.findMany({
      where: { storeId: { in: allowedStoreIds } },
      select: { title: true },
      distinct: ['title']
    });
    
    const collectionOptions = collections
      .filter((c: any) => c.title)
      .map((c: any) => ({ label: c.title, value: c.title }));

    return NextResponse.json({
      success: true,
      activities: enrichedActivities,
      pagination: {
        total: totalActivities,
        page,
        limit,
        totalPages: Math.ceil(totalActivities / limit)
      },
      currentStoreId: store.id,
      isMaster: store.isMaster,
      isMultiStore,
      storeOptions,
      collectionOptions
    });

  } catch (err: any) {
    console.error("[Activity API] Error:", err);
    return NextResponse.json({ success: false, error: err.message || err.toString() }, { status: 500 });
  }
}
