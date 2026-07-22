import { prisma } from "@/lib/db/prisma";

/**
 * Retrieves the store's SKU configuration and generates the next SKU.
 * If the store has no setting configured, it defaults to prefix "SKU".
 * 
 * @param storeId The unique ID of the store in the database
 * @returns The formatted SKU string (e.g. "ESH-000001")
 */
export async function generateNextSku(storeId: string): Promise<string> {
  // Ensure a setting exists for the store
  const setting = await prisma.storeSetting.upsert({
    where: { storeId },
    update: {},
    create: {
      storeId,
      skuPrefix: "SKU",
      skuSequence: 1,
    }
  });

  // The current sequence is what we will use
  const currentSequence = setting.skuSequence;

  // Immediately increment the sequence for the next call
  await prisma.storeSetting.update({
    where: { storeId },
    data: { skuSequence: { increment: 1 } }
  });

  // Format the SKU: PREFIX-000001
  // Pad with leading zeros to 6 digits
  const paddedSequence = currentSequence.toString().padStart(6, '0');
  return `${setting.skuPrefix}-${paddedSequence}`;
}

export async function generateSkusForProductIfNeeded(shopDomain: string, payload: any) {
  const store = await prisma.store.findUnique({ where: { shopDomain } });
  if (!store) return payload;

  const variants = payload.variants || [];
  let updated = false;

  for (const variant of variants) {
    if (!variant.sku || variant.sku.trim() === '') {
      variant.sku = await generateNextSku(store.id);
      updated = true;
      
      // We MUST push the newly generated SKU back to the Master Store's Shopify Admin
      // Otherwise, subsequent webhooks will see an empty SKU and generate ANOTHER new SKU, causing duplicates!
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
