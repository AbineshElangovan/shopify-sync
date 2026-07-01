import { prisma } from '@/lib/db/prisma';
import { SyncLog } from '@prisma/client';

export type SyncStatus = 'SUCCESS' | 'FAILED' | 'PENDING';

interface LogSyncParams {
  sku: string;
  sourceStoreId: string;
  destinationStoreId: string;
  previousQuantity: number;
  updatedQuantity: number;
  status: SyncStatus;
  failureReason?: string;
  triggerType?: string;
  webhookEventId?: string;
}

export async function createSyncLog(params: LogSyncParams): Promise<SyncLog> {
  try {
    const log = await prisma.syncLog.create({
      data: {
        sku: params.sku,
        sourceStoreId: params.sourceStoreId,
        destinationStoreId: params.destinationStoreId,
        previousQuantity: params.previousQuantity,
        updatedQuantity: params.updatedQuantity,
        status: params.status,
        failureReason: params.failureReason,
        triggerType: params.triggerType || 'WEBHOOK',
        webhookEventId: params.webhookEventId,
      },
    });
    return log;
  } catch (error) {
    console.error('Error creating sync log:', error);
    throw error;
  }
}

export async function getSyncLogs(limit: number = 50, skip: number = 0) {
  try {
    const logs = await prisma.syncLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip,
      include: {
        sourceStore: { select: { shopDomain: true, label: true } },
        destinationStore: { select: { shopDomain: true, label: true } },
      }
    });
    return logs;
  } catch (error) {
    console.error('Error fetching sync logs:', error);
    throw error;
  }
}
