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

    const activities = await prisma.activityLog.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      include: {
        store: {
          select: { id: true, label: true, shopDomain: true, isMaster: true }
        }
      },
      take: 100
    });
    
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
      isMaster: store.isMaster,
      isMultiStore,
      storeOptions,
      collectionOptions
    });

  } catch (err: any) {
    console.error("[Activity API] Error:", err);
    return handleApiError(err);
  }
}
