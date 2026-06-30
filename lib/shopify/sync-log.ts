import { prisma } from "@/lib/db/prisma";

export async function createSyncLog(data: {
  sku: string;
  sourceStoreId: string;
  destinationStoreId: string;
  previousQuantity: number;
  updatedQuantity: number;
  status: "SUCCESS" | "FAILED";
  failureReason?: string;
  webhookEventId?: string;
}) {
  try {
    return await prisma.syncLog.create({
      data: {
        ...data,
        triggerType: "WEBHOOK",
      },
    });
  } catch (error) {
    console.error("Failed to create SyncLog:", error);
    // Don't throw, we don't want to fail the actual sync process if logging fails
    return null;
  }
}

export async function updateSyncLog(id: string, data: { status: "SUCCESS" | "FAILED"; failureReason?: string }) {
  try {
    return await prisma.syncLog.update({
      where: { id },
      data,
    });
  } catch (error) {
    console.error(`Failed to update SyncLog ${id}:`, error);
    return null;
  }
}
