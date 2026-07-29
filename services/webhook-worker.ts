import { prisma } from "@/lib/db/prisma";
import { WebhookStatus } from "@prisma/client";

// Import your existing sync logic here
import { 
  processProductUpdate, 
  processProductCreate, 
  processProductDelete,
  hasSyncLock, 
  releaseSyncLock, 
  updateLocalProductCache, 
  withLock 
} from "@/services/product-sync";
import { generateSkusForProductIfNeeded } from "@/services/sku";
import { createMasterProductMapping, findMappingByVariantId } from "@/services/product-mapping";

const BATCH_SIZE = 20;
const MAX_RETRIES = 3;

export async function processWebhookQueue() {
  console.log(`[WebhookWorker] Starting queue processing...`);
  let processedCount = 0;

  try {
    // 1. Fetch pending webhooks
    const pendingJobs = await prisma.webhookQueue.findMany({
      where: { status: WebhookStatus.PENDING },
      orderBy: { createdAt: 'asc' },
      take: BATCH_SIZE,
    });

    if (pendingJobs.length === 0) {
      console.log(`[WebhookWorker] No pending webhooks found.`);
      return { processedCount: 0 };
    }

    console.log(`[WebhookWorker] Found ${pendingJobs.length} pending webhooks to process.`);

    for (const job of pendingJobs) {
      const startTime = Date.now();
      
      // 2. Lock the job (Transaction to prevent double processing)
      // We update it to PROCESSING. If another worker already took it, this will fail or return 0 records.
      try {
        const result = await prisma.webhookQueue.updateMany({
          where: { 
            id: job.id, 
            status: WebhookStatus.PENDING 
          },
          data: { 
            status: WebhookStatus.PROCESSING,
            attempts: { increment: 1 }
          }
        });

        if (result.count === 0) {
          console.log(`[WebhookWorker] Job ${job.id} already picked up by another worker. Skipping.`);
          continue;
        }
      } catch (lockError) {
         console.log(`[WebhookWorker] Could not lock job ${job.id}. Skipping.`);
         continue;
      }

      console.log(`[WebhookWorker] Processing job ${job.id} | Topic: ${job.topic} | Store: ${job.shopDomain}`);

      // 3. Process the job
      try {
        const payload = job.payload as any;

        // Route the job to the correct handler based on topic
        switch (job.topic) {
          case 'products/create':
            await handleProductsCreate(job.shopDomain, payload, job.webhookId);
            break;
          case 'products/update':
            await handleProductsUpdate(job.shopDomain, payload, job.webhookId);
            break;
          case 'products/delete':
            await handleProductsDelete(job.shopDomain, payload, job.webhookId);
            break;
          case 'inventory_levels/update':
            await handleInventoryUpdate(job.shopDomain, payload, job.webhookId);
            break;
          default:
            console.log(`[WebhookWorker] Unhandled topic: ${job.topic}`);
        }

        // 4. Mark as COMPLETED
        const duration = Date.now() - startTime;
        await prisma.webhookQueue.update({
          where: { id: job.id },
          data: { status: WebhookStatus.COMPLETED, error: null }
        });

        console.log(`[WebhookWorker] Successfully completed job ${job.id} in ${duration}ms.`);
        processedCount++;

      } catch (error: any) {
        // 5. Handle Failure and Retries
        const duration = Date.now() - startTime;
        const newAttempts = job.attempts + 1; // We already incremented once during lock
        const isFinalFailure = newAttempts >= MAX_RETRIES;
        const nextStatus = isFinalFailure ? WebhookStatus.FAILED : WebhookStatus.PENDING;

        await prisma.webhookQueue.update({
          where: { id: job.id },
          data: { 
            status: nextStatus, 
            error: `${error.message}\n${error.stack || ''}` 
          }
        });

        console.error(`[WebhookWorker] Job ${job.id} failed (Attempt ${newAttempts}/${MAX_RETRIES}) in ${duration}ms. Error: ${error.message}`);
        
        if (isFinalFailure) {
          console.error(`[WebhookWorker] Job ${job.id} reached maximum retries and is marked as FAILED.`);
        }
      }
    }

  } catch (globalError: any) {
    console.error(`[WebhookWorker] Fatal error during queue processing:`, globalError);
  }

  return { processedCount };
}

// --------------------------------------------------------------------------------
// Topic Handlers (Moved from route.ts)
// --------------------------------------------------------------------------------

async function handleProductsCreate(shop: string, payload: any, webhookId: string) {
  // Guard: Only allow synchronization from the Master Store
  const store = await prisma.store.findUnique({
    where: { shopDomain: shop },
  });

  if (!(store as any)?.isMaster) {
    console.log(`[Worker:products/create] Ignored event from Sub Store: ${shop}`);
    return;
  }

  // Loop prevention: check if this is an internally triggered sync creation
  const productGid = `gid://shopify/Product/${payload.id}`;
  if (hasSyncLock(shop, productGid, payload.title)) {
    console.log(`[Worker:products/create] Ignored internally triggered creation to prevent infinite loop for ${shop} (Product: ${payload.title})`);
    releaseSyncLock(shop, productGid, payload.title);
    return;
  }

  const lockKey = `product_sync_${payload.id}`;
  await withLock(lockKey, async () => {
    // Fetch the absolute latest source of truth from Shopify FIRST
    const { fetchLatestShopifyProduct } = require('@/services/shopify/product-fetcher');
    let enrichedPayload = payload;
    
    const latestPayload = await fetchLatestShopifyProduct(shop, payload.id);
    if (latestPayload) {
      latestPayload.variants.forEach((latestVariant: any) => {
         const originalVariant = payload.variants?.find((v: any) => v.admin_graphql_api_id === latestVariant.admin_graphql_api_id || v.id == latestVariant.id);
         if (!latestVariant.sku && originalVariant?.sku) {
             latestVariant.sku = originalVariant.sku;
         }
      });
      enrichedPayload = latestPayload;
    }

    enrichedPayload = await generateSkusForProductIfNeeded(shop, enrichedPayload);

    // Generate Product Unique ID for all variants FIRST
    const storeRecord = await prisma.store.findUnique({ where: { shopDomain: shop } });
    if (storeRecord && enrichedPayload.variants) {
      for (const variant of enrichedPayload.variants) {
        const variantIdStr = variant.admin_graphql_api_id?.split('/').pop() || String(variant.id);
        const productIdStr = String(enrichedPayload.id);
        const inventoryItemIdStr = variant.inventory_item_id ? String(variant.inventory_item_id) : null;
        
        const existingMapping = await prisma.productMapping.findUnique({
           where: { storeId_shopifyVariantId: { storeId: storeRecord.id, shopifyVariantId: variantIdStr } }
        });
        
        if (!existingMapping) {
          const mapping = await createMasterProductMapping(
            storeRecord.id, 
            productIdStr, 
            variantIdStr, 
            variant.sku || null, 
            inventoryItemIdStr
          );
          if (!mapping) {
             throw new Error(`Failed to persist mapping for variant ${variantIdStr}`);
          }
        }
      }
    }

    await updateLocalProductCache(shop, enrichedPayload);
    await processProductCreate(shop, enrichedPayload, webhookId);
  });
}

async function handleProductsUpdate(shop: string, payload: any, webhookId: string) {
  // Guard: Only allow synchronization from the Master Store
  const store = await prisma.store.findUnique({
    where: { shopDomain: shop },
  });

  if (!(store as any)?.isMaster) {
    console.log(`[Worker:products/update] Ignored event from Sub Store: ${shop}`);
    return;
  }

  // Loop prevention: check if this is an internally triggered sync update
  const productGid = `gid://shopify/Product/${payload.id}`;
  if (hasSyncLock(shop, productGid, payload.title)) {
    console.log(`[Worker:products/update] Ignored internally triggered update to prevent infinite loop for ${shop} (Product: ${payload.title})`);
    releaseSyncLock(shop, productGid, payload.title);
    return;
  }

  const lockKey = `product_sync_${payload.id}`;
  await withLock(lockKey, async () => {
    const { fetchLatestShopifyProduct } = require('@/services/shopify/product-fetcher');
    let currentPayload = payload;
    
    const latestPayload = await fetchLatestShopifyProduct(shop, payload.id);
    if (latestPayload) {
      latestPayload.variants.forEach((latestVariant: any) => {
         const originalVariant = payload.variants?.find((v: any) => v.admin_graphql_api_id === latestVariant.admin_graphql_api_id || v.id == latestVariant.id);
         if (!latestVariant.sku && originalVariant?.sku) {
             latestVariant.sku = originalVariant.sku;
         }
      });
      currentPayload = latestPayload;
    }

    currentPayload = await generateSkusForProductIfNeeded(shop, currentPayload);

    await updateLocalProductCache(shop, currentPayload, 'products/update'); // Pass topic if required
    await processProductUpdate(shop, currentPayload, webhookId);
    
    // Verify Product Mapping exists for all variants
    const storeRecord = await prisma.store.findUnique({ where: { shopDomain: shop } });
    if (storeRecord && currentPayload.variants) {
      for (const variant of currentPayload.variants) {
        const variantIdStr = variant.admin_graphql_api_id?.split('/').pop() || String(variant.id);
        const mapping = await findMappingByVariantId(storeRecord.id, variantIdStr);
        if (!mapping) {
           throw new Error(`Data Inconsistency: Mapping missing for variant ${variantIdStr}`);
        }
      }
    }
  });
}

async function handleProductsDelete(shop: string, payload: any, webhookId: string) {
  const store = await prisma.store.findUnique({
    where: { shopDomain: shop },
  });

  if (!store) return;

  if (!(store as any)?.isMaster) {
    console.log(`[Worker:products/delete] Ignored sync propagation from Sub Store, but cleaning up local cache: ${shop}`);
    const deletedGid = `gid://shopify/Product/${payload.id}`;
    
    await prisma.variantMap.deleteMany({
      where: { storeId: store.id, shopifyProductId: deletedGid },
    });

    const caches = await prisma.productCache.findMany({
      where: { storeId: store.id, shopifyProductId: deletedGid },
      select: { id: true }
    });
    for (const c of caches) {
      await prisma.collectionProduct.deleteMany({ where: { productCacheId: c.id } });
    }

    await prisma.productCache.deleteMany({
      where: { storeId: store.id, shopifyProductId: deletedGid },
    });
    return;
  }

  // Loop prevention: check if this is an internally triggered sync deletion
  const productGid = `gid://shopify/Product/${payload.id}`;
  if (hasSyncLock(shop, productGid, "DELETE")) {
    console.log(`[Worker:products/delete] Ignored internally triggered deletion to prevent loop for ${shop} (Product ID: ${payload.id})`);
    releaseSyncLock(shop, productGid, "DELETE");
    return;
  }

  // Replicate deletion to target stores
  const { processProductDelete } = require('@/services/shopify/product-sync');
  await processProductDelete(shop, payload, webhookId);
  
  // Delete the Mapping
  if (store) {
    const { deleteMappingsForProduct } = require('@/services/product-mapping');
    const deleted = await deleteMappingsForProduct(store.id, String(payload.id));
    if (!deleted) {
      console.warn(`[Worker:products/delete] Warning: Mapping not found to delete for product ${payload.id}`);
    }
  }

  console.log(`[Worker:products/delete] sync complete for ${shop}`);
  
  // Clean up Master store local cache
  const deletedGid = `gid://shopify/Product/${payload.id}`;
  await prisma.variantMap.deleteMany({
    where: { storeId: store?.id, shopifyProductId: deletedGid },
  });

  const masterCaches = await prisma.productCache.findMany({
    where: { storeId: store?.id, shopifyProductId: deletedGid },
    select: { id: true }
  });
  for (const mc of masterCaches) {
    await prisma.collectionProduct.deleteMany({ where: { productCacheId: mc.id } });
  }

  await prisma.productCache.deleteMany({
    where: { storeId: store?.id, shopifyProductId: deletedGid },
  });
  console.log(`[Worker:products/delete] Cleaned up local cache for Master Store: ${shop}`);
}

async function handleInventoryUpdate(shop: string, payload: any, webhookId: string) {
  const { inventory_item_id, location_id, available } = payload;

  if (!inventory_item_id || !location_id || typeof available !== 'number') {
    throw new Error(`Invalid payload for ${shop}`);
  }

  const { processInventoryUpdate } = require('@/services/shopify/inventory-sync');
  await processInventoryUpdate(
    shop,
    inventory_item_id.toString(),
    location_id.toString(),
    available,
    webhookId
  );
}
