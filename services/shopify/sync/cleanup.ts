import { prisma } from '@/lib/db/prisma';
import { getAdminClient } from '@/lib/shopify/admin';

const GET_ALL_PRODUCTS_QUERY = `
  query getAllProducts($cursor: String) {
    products(first: 250, after: $cursor) {
      edges {
        node {
          id
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

/**
 * Fetches all live product IDs from Shopify for a given store.
 * Implements retries and aborts on failure to prevent accidental deletions.
 */
async function fetchAllLiveProductIds(shopDomain: string): Promise<Set<string>> {
  const client = await getAdminClient(shopDomain);
  const liveProductIds = new Set<string>();
  
  let hasNextPage = true;
  let cursor = null;
  let attempt = 0;
  const MAX_RETRIES = 3;

  while (hasNextPage) {
    try {
      const response: any = await client.request(GET_ALL_PRODUCTS_QUERY, { variables: { cursor } });
      const products = response?.data?.products;
      
      if (!products) {
        throw new Error("Invalid response from Shopify API");
      }

      for (const edge of products.edges) {
        liveProductIds.add(edge.node.id);
      }
      
      hasNextPage = products.pageInfo.hasNextPage;
      cursor = products.pageInfo.endCursor;
      attempt = 0; // Reset attempts on successful page fetch
    } catch (error: any) {
      attempt++;
      console.error(`[Cleanup] Failed to fetch product page for ${shopDomain} (Attempt ${attempt}/${MAX_RETRIES}):`, error.message);
      
      if (attempt >= MAX_RETRIES) {
        throw new Error(`[Cleanup] Aborting cleanup for ${shopDomain}. Shopify API failed after ${MAX_RETRIES} attempts.`);
      }
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  return liveProductIds;
}

/**
 * Validates local DB against Shopify's live API and cleans up orphaned records.
 * Runs in a strict transaction.
 */
export async function cleanupOrphanedProducts(storeId: string) {
  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store || !store.isActive) {
    console.log(`[Cleanup] Store ${storeId} not found or inactive. Skipping.`);
    return;
  }

  console.log(`[Cleanup] Started for store ${store.shopDomain}`);
  
  let liveProductIds: Set<string>;
  try {
    liveProductIds = await fetchAllLiveProductIds(store.shopDomain);
    console.log(`[Cleanup] Successfully fetched ${liveProductIds.size} live products from Shopify.`);
  } catch (error: any) {
    // ABORT on failure. DO NOT delete anything.
    console.error(`[Cleanup] CRITICAL ABORT:`, error.message);
    return;
  }

  // Find orphaned ProductCaches
  const caches = await prisma.productCache.findMany({
    where: { storeId: store.id },
    select: { id: true, shopifyProductId: true }
  });

  const orphanCaches = caches.filter(c => !liveProductIds.has(c.shopifyProductId));
  
  // Find orphaned ProductMappings
  const mappings = await prisma.productMapping.findMany({
    where: { storeId: store.id },
    select: { id: true, shopifyProductId: true }
  });
  
  const orphanMappings = mappings.filter(m => !liveProductIds.has(m.shopifyProductId));

  if (orphanCaches.length === 0 && orphanMappings.length === 0) {
    console.log(`[Cleanup] No orphaned records found. Store is clean.`);
    return;
  }

  console.log(`[Cleanup] Found ${orphanCaches.length} orphaned caches and ${orphanMappings.length} orphaned mappings.`);

  // Use a transaction for safe deletion
  try {
    await prisma.$transaction(async (tx) => {
      // 1. Delete CollectionProducts associated with orphaned caches
      if (orphanCaches.length > 0) {
        const orphanCacheIds = orphanCaches.map(c => c.id);
        const deletedColProds = await tx.collectionProduct.deleteMany({
          where: { productCacheId: { in: orphanCacheIds } }
        });
        console.log(`[Cleanup] Deleted ${deletedColProds.count} associated CollectionProduct records.`);
        
        const deletedCaches = await tx.productCache.deleteMany({
          where: { id: { in: orphanCacheIds } }
        });
        console.log(`[Cleanup] Deleted ${deletedCaches.count} orphaned ProductCache records.`);
      }

      // 2. Delete orphaned mappings
      if (orphanMappings.length > 0) {
        const orphanMappingIds = orphanMappings.map(m => m.id);
        const deletedMappings = await tx.productMapping.deleteMany({
          where: { id: { in: orphanMappingIds } }
        });
        console.log(`[Cleanup] Deleted ${deletedMappings.count} orphaned ProductMapping records.`);
      }

      // 3. Delete legacy VariantMaps
      if (orphanCaches.length > 0) {
         const orphanShopifyIds = orphanCaches.map(c => c.shopifyProductId);
         const deletedVariants = await tx.variantMap.deleteMany({
            where: { storeId: store.id, shopifyProductId: { in: orphanShopifyIds } }
         });
         console.log(`[Cleanup] Deleted ${deletedVariants.count} legacy VariantMap records.`);
      }
    });

    console.log(`[Cleanup] Completed successfully for ${store.shopDomain}.`);
  } catch (txError: any) {
    console.error(`[Cleanup] Transaction failed! Rolled back. Error:`, txError.message);
  }
}
