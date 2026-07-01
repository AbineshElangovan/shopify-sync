import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { Prisma } from '@prisma/client';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '10', 10);
    const status = searchParams.get('status');
    const search = searchParams.get('search');

    const skip = (page - 1) * limit;

    const where: Prisma.SyncLogWhereInput = {};
    if (status && status !== 'ALL') {
      where.status = status;
    }
    if (search) {
      where.sku = { contains: search, mode: 'insensitive' };
    }

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
      prisma.syncLog.count(),
      prisma.syncLog.count({ where: { status: 'SUCCESS' } }),
      prisma.syncLog.count({ where: { status: 'FAILED' } }),
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
    return new NextResponse(`Error: ${error.message}`, { status: 500 });
  }
}
