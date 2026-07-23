import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { Prisma } from '@prisma/client';
import { authenticate, handleApiError } from '@/lib/shopify/authenticate';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { store } = await authenticate(req);

    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '10', 10);
    const status = searchParams.get('status');
    const search = searchParams.get('search');

    const skip = (page - 1) * limit;

    const baseStoreFilter = {
      OR: [
        { sourceStoreId: store.id },
        { destinationStoreId: store.id }
      ]
    };

    const where: Prisma.SyncLogWhereInput = {
      AND: [
        baseStoreFilter,
        ...(status && status !== 'ALL' ? [{ status }] : []),
        ...(search ? [{ sku: { contains: search, mode: 'insensitive' } }] : []),
      ] as any
    };

    const [logs, total, totalStats, successStats, failedStats] = await Promise.all([
      prisma.syncLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          sourceStore: { select: { shopDomain: true, label: true } },
          destinationStore: { select: { shopDomain: true, label: true } },
        }
      }),
      prisma.syncLog.count({ where }),
      prisma.syncLog.count({ where: baseStoreFilter }),
      prisma.syncLog.count({ where: { ...baseStoreFilter, status: 'SUCCESS' } }),
      prisma.syncLog.count({ where: { ...baseStoreFilter, status: 'FAILED' } }),
    ]);

    return NextResponse.json({
      logs,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      stats: {
        total: totalStats,
        success: successStats,
        failed: failedStats,
      }
    });

  } catch (error: any) {
    console.error('Failed to fetch sync logs:', error);
    return handleApiError(error);
  }
}
