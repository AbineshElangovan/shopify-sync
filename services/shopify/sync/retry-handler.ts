import { prisma } from '@/lib/db/prisma';
import { logAuthEvent } from '@/lib/auth/audit';

export interface RetryContext {
  targetStoreDomain: string;
  targetStoreId: string;
  sourceStoreId: string;
  webhookEventId?: string;
  syncType: string;
  webhookTopic?: string;
  sku?: string;
}

export interface SyncOperationResult {
  success: boolean;
  requestId?: string;
  errorCode?: string;
  errorMessage?: string;
  durationMs?: number;
  retryCount: number;
  payload?: any;
}

export async function executeWithRetry(
  context: RetryContext,
  operation: () => Promise<any>
): Promise<SyncOperationResult> {
  const maxRetries = 3;
  let retryCount = 0;
  let delayMs = 2000;
  const startTime = Date.now();

  let requestId = undefined;

  while (retryCount <= maxRetries) {
    try {
      // Create/Update SyncLog for PENDING/PROCESSING/RETRYING
      await prisma.syncLog.upsert({
        where: {
          webhookEventId_syncType_destinationStoreId: {
            webhookEventId: context.webhookEventId || "none",
            syncType: context.syncType,
            destinationStoreId: context.targetStoreId,
          }
        },
        update: {
          status: retryCount === 0 ? "PROCESSING" : "RETRYING",
          retryCount,
          nextRetryAt: null,
          sku: context.sku
        },
        create: {
          webhookEventId: context.webhookEventId || "none",
          syncType: context.syncType,
          destinationStoreId: context.targetStoreId,
          sourceStoreId: context.sourceStoreId,
          status: "PROCESSING",
          retryCount: 0,
          webhookTopic: context.webhookTopic,
          sku: context.sku,
        }
      });

      const response = await operation();
      
      // Attempt to extract X-Request-ID from Shopify Graphql client response headers if available
      requestId = response?.headers?.get?.('x-request-id') || response?.headers?.['x-request-id'];

      const durationMs = Date.now() - startTime;

      await prisma.syncLog.update({
        where: {
          webhookEventId_syncType_destinationStoreId: {
            webhookEventId: context.webhookEventId || "none",
            syncType: context.syncType,
            destinationStoreId: context.targetStoreId,
          }
        },
        data: {
          status: "SUCCESS",
          durationMs,
          requestId,
        }
      });

      return {
        success: true,
        requestId,
        durationMs,
        retryCount,
        payload: response
      };

    } catch (error: any) {
      // Classification
      const errorMessage = error.message || String(error);
      const is403 = errorMessage.includes('403') || errorMessage.includes('Forbidden');
      const is401 = errorMessage.includes('401') || errorMessage.includes('Unauthorized');
      const is404 = errorMessage.includes('404') || errorMessage.includes('Not Found');
      const is429 = errorMessage.includes('429') || errorMessage.includes('Too Many Requests');
      const is5xx = errorMessage.match(/50\d/);
      
      const isInvalidToken = errorMessage.includes('CRITICAL') || errorMessage.includes('empty access token');

      let errorCode = "UNKNOWN";
      if (is403) errorCode = "403";
      else if (is401) errorCode = "401";
      else if (is404) errorCode = "404";
      else if (is429) errorCode = "429";
      else if (is5xx) errorCode = "5xx";
      else if (isInvalidToken) errorCode = "INVALID_TOKEN";
      
      const isRetriable = is429 || is5xx || (!is403 && !is401 && !is404 && !isInvalidToken);

      if (is401 || is403 || isInvalidToken) {
        // Pause store, prevent further jobs, mark REQUIRES_REAUTH
        await prisma.store.update({
          where: { id: context.targetStoreId },
          data: { 
            isActive: false,
            authStatus: 'REQUIRES_REAUTH',
            lastAuthFailure: new Date(),
            authFailureReason: errorMessage
          }
        });

        const store = await prisma.store.findUnique({ where: { id: context.targetStoreId } });
        if (store) {
          await logAuthEvent(
            store.shopDomain,
            "Worker Authentication Failed",
            false,
            `Job failed due to ${errorCode}: ${errorMessage}`
          );
        }

        // Return immediately. Do not retry authentication failures.
        return {
          success: false,
          errorCode,
          errorMessage,
          durationMs: Date.now() - startTime,
          retryCount
        };
      }

      if (isRetriable && retryCount < maxRetries) {
        retryCount++;
        // Calculate exponential backoff with a bit of jitter (±10%)
        const jitter = 1 + (Math.random() * 0.2 - 0.1); 
        const waitTime = delayMs * jitter;
        
        const nextRetryAt = new Date(Date.now() + waitTime);
        await prisma.syncLog.update({
          where: {
            webhookEventId_syncType_destinationStoreId: {
              webhookEventId: context.webhookEventId || "none",
              syncType: context.syncType,
              destinationStoreId: context.targetStoreId,
            }
          },
          data: {
            status: "FAILED",
            errorCode,
            errorMessage,
            nextRetryAt
          }
        });

        await new Promise(res => setTimeout(res, waitTime));
        delayMs *= 2; // Exponential backoff: 2s -> 4s -> 8s
        continue;
      }

      // Final failure
      const durationMs = Date.now() - startTime;
      await prisma.syncLog.update({
        where: {
          webhookEventId_syncType_destinationStoreId: {
            webhookEventId: context.webhookEventId || "none",
            syncType: context.syncType,
            destinationStoreId: context.targetStoreId,
          }
        },
        data: {
          status: "FAILED",
          errorCode,
          errorMessage,
          durationMs,
          nextRetryAt: null
        }
      });

      // Send to Dead Letter Queue (DLQ) for admin review
      await prisma.deadLetterQueue.create({
        data: {
          storeId: context.targetStoreId,
          jobType: context.syncType,
          payload: { context, errorMessage, errorCode } as any,
          error: errorMessage,
          failedAttempts: retryCount + 1
        }
      });

      return {
        success: false,
        errorCode,
        errorMessage,
        durationMs,
        retryCount
      };
    }
  }

  return { success: false, retryCount };
}
