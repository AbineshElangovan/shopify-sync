import { prisma } from "@/lib/db/prisma";

export async function generateSkusForProductIfNeeded(shopDomain: string, payload: any) {
  const store = await prisma.store.findUnique({ where: { shopDomain } });
  if (!store) return payload;

  let setting = await prisma.storeSetting.findUnique({ where: { storeId: store.id } });

  if (!setting) {
    setting = await prisma.storeSetting.create({
      data: {
        storeId: store.id,
        skuPrefix: "SKU",
        skuSequence: 1,
        isSkuGenerationEnabled: true,
      }
    });
  }

  if (!setting.isSkuGenerationEnabled) {
    return payload;
  }

  const prefix = setting.skuPrefix || "SKU";
  const variants = payload.variants || [];
  if (variants.length === 0) return payload;

  const variantsToUpdate = [];

  for (const variant of variants) {
    const numericVariantId = variant.admin_graphql_api_id
      ? variant.admin_graphql_api_id.replace('gid://shopify/ProductVariant/', '')
      : variant.id.toString();

    let variantBase = await prisma.variantBaseSku.findUnique({
      where: {
        storeId_shopifyVariantId: {
          storeId: store.id,
          shopifyVariantId: numericVariantId,
        }
      }
    });

    // If it doesn't have a variant base in this store, but ALREADY has a valid SKU, 
    // it was likely synced from a previous master store. We should keep the existing SKU.
    if (!variantBase && variant.sku && variant.sku !== "N/A" && variant.sku.trim() !== "") {
      continue;
    }

    if (!variantBase) {
      // Increment global sequence for this new variant exactly once
      const updatedSetting = await prisma.storeSetting.update({
        where: { storeId: store.id },
        data: { skuSequence: { increment: 1 } },
        select: { skuSequence: true }
      });

      const sequenceToUse = updatedSetting.skuSequence - 1;
      variantBase = await prisma.variantBaseSku.create({
        data: {
          storeId: store.id,
          shopifyVariantId: numericVariantId,
          baseSequence: sequenceToUse
        }
      });
    }

    const paddedSequence = variantBase.baseSequence.toString().padStart(4, '0');

    let optionsStr = "";
    if (variant.title && variant.title !== 'Default Title') {
      optionsStr = "-" + variant.title.toUpperCase().replace(/[\s\/]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    } else {
      const opts = [variant.option1, variant.option2, variant.option3].filter(Boolean);
      if (opts.length > 0 && opts[0] !== 'Default Title') {
        optionsStr = "-" + opts.map((o: any) => o.toString().toUpperCase().replace(/[\s\/]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')).join('-');
      }
    }

    const expectedSku = `${prefix}-${paddedSequence}${optionsStr}`;

    // Detect if the variant's SKU needs to be generated or regenerated
    if (variant.sku !== expectedSku) {
      variant.sku = expectedSku;
      variantsToUpdate.push(variant);
    }
  }

  if (variantsToUpdate.length > 0) {
    // Push the updated SKUs back to Shopify Admin in bulk
    try {
      const { getAdminClient } = require('@/lib/shopify/admin');
      const client = await getAdminClient(shopDomain);

      const numericProductId = payload.admin_graphql_api_id
        ? payload.admin_graphql_api_id
        : `gid://shopify/Product/${payload.id}`;

      const formattedVariants = variantsToUpdate.map(v => {
        const numericVariantId = v.admin_graphql_api_id
          ? v.admin_graphql_api_id
          : `gid://shopify/ProductVariant/${v.id}`;
        return {
          id: numericVariantId,
          inventoryItem: { sku: v.sku }
        };
      });

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
          variants: formattedVariants
        }
      });
      console.log(`[SKU Generator] Successfully updated ${variantsToUpdate.length} variant SKUs for Product ${numericProductId}`);
    } catch (err: any) {
      console.error(`[SKU Generator] Failed to push SKUs back to Master Store:`, err.message);
    }
  }

  return payload;
}
