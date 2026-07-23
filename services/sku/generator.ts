import { prisma } from "@/lib/db/prisma";

export async function generateSkusForProductIfNeeded(shopDomain: string, payload: any) {
  const store = await prisma.store.findUnique({ where: { shopDomain } });
  if (!store) return payload;

  const setting = await prisma.storeSetting.findUnique({ where: { storeId: store.id } });
  if (!setting || !setting.isSkuGenerationEnabled) {
    return payload; // SKU generation is disabled or not configured
  }

  const prefix = setting.skuPrefix || "SKU";
  const variants = payload.variants || [];

  let needsGeneration = variants.some((v: any) => !v.sku || v.sku.trim() === '');
  if (!needsGeneration) return payload;

  // Use a transaction to atomically increment the sequence for each variant that needs a SKU
  for (const variant of variants) {
    if (!variant.sku || variant.sku.trim() === '') {
      // 1. Atomically get and increment the sequence in one database operation
      const updatedSetting = await prisma.storeSetting.update({
        where: { storeId: store.id },
        data: {
          skuSequence: { increment: 1 }
        },
        select: { skuSequence: true }
      });
      
      // The updatedSetting.skuSequence is the NEXT sequence (incremented),
      // so the sequence we USE for this variant is the value BEFORE incrementing.
      const sequenceToUse = updatedSetting.skuSequence - 1;
      
      const paddedSequence = sequenceToUse.toString().padStart(4, '0');
      variant.sku = `STB-${prefix}-${paddedSequence}`;
      
      // 2. Push the newly generated SKU back to the Master Store's Shopify Admin
      try {
        const { getAdminClient } = require('@/lib/shopify/admin');
        const client = await getAdminClient(shopDomain);
        
        const numericVariantId = variant.admin_graphql_api_id 
          ? variant.admin_graphql_api_id 
          : `gid://shopify/ProductVariant/${variant.id}`;
          
        const numericProductId = payload.admin_graphql_api_id
          ? payload.admin_graphql_api_id
          : `gid://shopify/Product/${payload.id}`;
          
        const updateMutation = `
          mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
            productVariantsBulkUpdate(productId: $productId, variants: $variants) {
              userErrors { field message }
            }
          }
        `;
        await client.request(updateMutation, {
          variables: {
            productId: numericProductId,
            variants: [{
              id: numericVariantId,
              inventoryItem: { sku: variant.sku }
            }]
          }
        });
        console.log(`[SKU Generator] Successfully pushed generated SKU ${variant.sku} back to Master Store ${shopDomain}`);
      } catch (err: any) {
        console.error(`[SKU Generator] Failed to push SKU ${variant.sku} back to Master Store:`, err.message);
      }
    }
  }

  return payload;
}
