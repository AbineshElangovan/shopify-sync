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

    const totalLogsInDb = await prisma.syncLog.count();
    if (totalLogsInDb === 0) {
      const sourceStore = await prisma.store.findFirst({
        where: { shopDomain: 'eshan-inventory-solutions.myshopify.com' }
      });
      if (sourceStore) {
        const targetStore = await prisma.store.upsert({
          where: { shopDomain: 'eshan-chennai-outlet.myshopify.com' },
          update: {
            label: 'ESHAN Chennai Outlet',
            accessToken: 'shpua_dummytargetstoretokenvalue123',
            scope: 'write_products,write_inventory',
            isActive: false,
          },
          create: {
            shopDomain: 'eshan-chennai-outlet.myshopify.com',
            label: 'ESHAN Chennai Outlet',
            accessToken: 'shpua_dummytargetstoretokenvalue123',
            scope: 'write_products,write_inventory',
            isActive: false,
          },
        });

        const mockLogs = [
          { sku: 'ES-TSHIRT-L', previousQuantity: 15, updatedQuantity: 12, status: 'SUCCESS' },
          { sku: 'ES-JEANS-32', previousQuantity: 3, updatedQuantity: 5, status: 'SUCCESS' },
          { sku: 'ES-SHOES-10', previousQuantity: 10, updatedQuantity: 8, status: 'FAILED', failureReason: 'Location ID not mapped on target store.' },
          { sku: 'ES-JACKET-M', previousQuantity: 20, updatedQuantity: 15, status: 'SUCCESS' },
          { sku: 'ES-CAP-RED', previousQuantity: 0, updatedQuantity: 2, status: 'SUCCESS' }
        ];

        for (const logData of mockLogs) {
          await prisma.syncLog.create({
            data: {
              sku: logData.sku,
              sourceStoreId: sourceStore.id,
              destinationStoreId: targetStore.id,
              previousQuantity: logData.previousQuantity,
              updatedQuantity: logData.updatedQuantity,
              status: logData.status,
              failureReason: logData.failureReason,
            }
          });
        }
      }
    }

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
