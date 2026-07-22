import { prisma } from "@/lib/db/prisma";
import { getAdminClient } from "@/lib/shopify/admin";
import { generateNextSku } from "../sku/generator";
import { GET_PRODUCTS_QUERY } from "./graphql";

export async function pushProductsToDestinations(sourceStoreId: string, targetStoreIds: string[]) {
  console.log(`[PushSync] Starting push sync from source: ${sourceStoreId} to targets:`, targetStoreIds);
  
  const sourceStore = await prisma.store.findUnique({ where: { id: sourceStoreId } });
  if (!sourceStore || !sourceStore.isActive) throw new Error("Source store is invalid or inactive");

  const targetStores = await prisma.store.findMany({
    where: { id: { in: targetStoreIds }, isActive: true }
  });

  if (targetStores.length === 0) throw new Error("No active target stores found");

  const sourceClient = await getAdminClient(sourceStore.shopDomain);
  
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

  // 2. Iterate Target Stores
  for (const targetStore of targetStores) {
    try {
      const targetClient = await getAdminClient(targetStore.shopDomain);
      
      // Get primary location of target store for inventory sync
      const locResponse = await targetClient.request(`query { locations(first: 1) { edges { node { id } } } }`);
      const targetLocationId = locResponse.data?.locations?.edges?.[0]?.node?.id;

      for (const sourceProduct of allSourceProducts) {
        // Map variants and generate SKUs if missing
        const variantsToPush = [];
        for (const vEdge of sourceProduct.variants?.edges ?? []) {
          const v = vEdge.node;
          let sku = v.sku?.trim();
          if (!sku) {
            sku = await generateNextSku(targetStore.id);
          }
          
          variantsToPush.push({
            id: v.id, // We'll need to check if we are updating or creating
            title: v.title,
            price: v.price,
            sku: sku,
            inventoryItem: v.inventoryItem,
          });
        }

        // Check if product is already mapped
        const existingMap = await prisma.productMapping.findUnique({
          where: {
            sourceStoreId_targetStoreId_sourceProductId: {
              sourceStoreId: sourceStore.id,
              targetStoreId: targetStore.id,
              sourceProductId: sourceProduct.id
            }
          }
        });

        if (existingMap) {
          // UPDATE EXISTING PRODUCT
          // Minimal implementation: in production we would send a productUpdate mutation
          console.log(`[PushSync] Updating existing product mapped to ${existingMap.targetProductId}`);
          // ... update logic
        } else {
          // CREATE NEW PRODUCT
          const productCreateInput = {
            title: sourceProduct.title,
            descriptionHtml: sourceProduct.descriptionHtml,
            vendor: sourceProduct.vendor,
            productType: sourceProduct.productType,
            status: sourceProduct.status,
            variants: variantsToPush.map(v => ({
              price: v.price,
              sku: v.sku,
              title: v.title,
            }))
          };

          const createMutation = `
            mutation productCreate($input: ProductInput!) {
              productCreate(input: $input) {
                product { id variants(first: 100) { edges { node { id } } } }
                userErrors { field message }
              }
            }
          `;
          const res = await targetClient.request(createMutation, { variables: { input: productCreateInput } });
          const newProduct = res.data?.productCreate?.product;
          
          if (newProduct) {
             // Save Mapping
             await prisma.productMapping.create({
               data: {
                 sourceStoreId: sourceStore.id,
                 targetStoreId: targetStore.id,
                 sourceProductId: sourceProduct.id,
                 targetProductId: newProduct.id,
                 // variant mapping can be added here
               }
             });
             console.log(`[PushSync] Created product ${newProduct.id} on ${targetStore.shopDomain}`);
          } else {
             console.error("[PushSync] Failed to create product", res.data?.productCreate?.userErrors);
          }
        }
      }
      
      // Log Success
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
      
    } catch (targetErr: any) {
      console.error(`[PushSync] Error syncing to target ${targetStore.shopDomain}:`, targetErr);
      await prisma.syncLog.create({
        data: {
          sku: "FULL_SYNC",
          sourceStoreId: sourceStore.id,
          destinationStoreId: targetStore.id,
          previousQuantity: 0,
          updatedQuantity: 0,
          status: "FAILED",
          failureReason: targetErr.message,
          triggerType: "MANUAL",
        }
      });
    }
  }
}
