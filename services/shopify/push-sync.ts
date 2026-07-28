import { prisma } from "@/lib/db/prisma";
import { getAdminClient } from "@/lib/shopify/admin";
import { GET_PRODUCTS_QUERY } from "./graphql";
import { fetchLatestShopifyProduct } from "./product-fetcher";
import { processProductCreate } from "./product-sync";
import { cleanupOrphanedProducts } from "./sync/cleanup";

export async function pushProductsToDestinations(sourceStoreId: string, targetStoreIds: string[]) {
  console.log(`[PushSync] Starting push sync from source: ${sourceStoreId} to targets:`, targetStoreIds);
  
  const sourceStore = await prisma.store.findUnique({ where: { id: sourceStoreId } });
  if (!sourceStore || !sourceStore.isActive) throw new Error("Source store is invalid or inactive");

  const targetStores = await prisma.store.findMany({
    where: { id: { in: targetStoreIds }, isActive: true }
  });

  if (targetStores.length === 0) throw new Error("No active target stores found");

  const sourceClient = await getAdminClient(sourceStore.shopDomain);
  
  // 0. Garbage Collection: Self-Healing Cleanup for all involved stores
  console.log(`[PushSync] Running pre-sync Garbage Collection for source store...`);
  await cleanupOrphanedProducts(sourceStore.id);
  
  for (const targetStore of targetStores) {
    console.log(`[PushSync] Running pre-sync Garbage Collection for target store ${targetStore.shopDomain}...`);
    await cleanupOrphanedProducts(targetStore.id);
  }

  // 1. Fetch Source Products
  let hasNextPage = true;
  let cursor: string | null = null;
  const allSourceProducts = [];

  while (hasNextPage) {
    const variables: any = { first: 50 };
    if (cursor) variables.after = cursor;
    const response = await sourceClient.request(GET_PRODUCTS_QUERY, { variables });
    
    const productEdges = response?.data?.products?.edges ?? [];
    allSourceProducts.push(...productEdges.map((e: any) => e.node));
    
    hasNextPage = response?.data?.products?.pageInfo?.hasNextPage ?? false;
    cursor = response?.data?.products?.pageInfo?.endCursor ?? null;
  }

  console.log(`[PushSync] Fetched ${allSourceProducts.length} products from Source Store.`);

  const targetStoreDomains = targetStores.map(s => s.shopDomain);

  // 2. Iterate Source Products and trigger processProductCreate
  for (const sourceProduct of allSourceProducts) {
    try {
      console.log(`[PushSync] Syncing product ${sourceProduct.id}`);
      let payload = await fetchLatestShopifyProduct(sourceStore.shopDomain, sourceProduct.id);
      if (!payload) continue;

      const webhookId = `manual-sync-${Date.now()}-${payload.id}`;
      // This will handle Create, Update, Collection mappings, Price adjustments, and Images!
      await processProductCreate(sourceStore.shopDomain, payload, webhookId, targetStoreDomains);
    } catch (err: any) {
       console.error(`[PushSync] Error syncing product ${sourceProduct.id}:`, err);
    }
  }

  // 3. Log Success
  for (const targetStore of targetStores) {
      await prisma.syncLog.create({
        data: {
          sku: "FULL_SYNC",
          sourceStoreId: sourceStore.id,
          destinationStoreId: targetStore.id,
          previousQuantity: 0,
          updatedQuantity: 0,
          status: "SUCCESS",
          triggerType: "MANUAL",
        }
      });
  }
}
