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

    if (store.isMaster) {
      const connections = await (prisma as any).storeConnection.findMany({
        where: { sourceStoreId: store.id }
      });
      allowedStoreIds = [store.id, ...connections.map((c: any) => c.targetStoreId)];
      isMultiStore = connections.length > 0;
    } else {
      allowedStoreIds = [store.id];
      const connections = await (prisma as any).storeConnection.findMany({
         where: { targetStoreId: store.id }
      });
      if (connections.length > 0) isMultiStore = true;
    }

    let storeIdsToQuery = allowedStoreIds;
    if (store.isMaster && filterStoreId && filterStoreId !== 'all') {
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
    
    let storeOptions: any[] = [];
    if (store.isMaster && isMultiStore) {
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
      activities,
      pagination: {
        total: totalActivities,
        page,
        limit,
        totalPages: Math.ceil(totalActivities / limit)
      },
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
