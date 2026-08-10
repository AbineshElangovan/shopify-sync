import { prisma } from "@/lib/db/prisma";
import { getAdminClient } from "@/lib/shopify/admin";

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

  const globalPrefix = "STB"; // The application prefix is read-only "STB" as requested
  const variants = payload.variants || [];
  if (variants.length === 0) return payload;

  const numericProductId = payload.admin_graphql_api_id
    ? payload.admin_graphql_api_id.replace('gid://shopify/Product/', '')
    : payload.id.toString();
  const graphqlProductId = `gid://shopify/Product/${numericProductId}`;

  // 1. Fetch active collection rules for this store
  const activeRules = await prisma.collectionSkuRule.findMany({
    where: { storeId: store.id, enabled: true },
    include: { collection: true }
  });

  let appliedRule: any = null;

  if (activeRules.length > 0) {
    try {
      // 2. Fetch the product's collections from Shopify GraphQL to be absolutely sure we have the latest
      // Important: Add a small delay for Shopify to index the newly created product's collections!
      await new Promise(r => setTimeout(r, 3000));
      
      const client = await getAdminClient(shopDomain);
      const colResponse: any = await client.request(`
        query getProductCollections($id: ID!) {
          product(id: $id) {
            collections(first: 10) {
              edges { node { id title } }
            }
          }
        }
      `, { variables: { id: graphqlProductId } });

      const productCollections = colResponse?.data?.product?.collections?.edges?.map((e: any) => e.node.id) || [];
      
      // Fallback: Check tags if GraphQL collections are empty or lagging
      const payloadTags = (payload.tags || "").split(',').map((t: string) => t.trim().toLowerCase());
      
      activeRules.sort((a, b) => a.collection.title.localeCompare(b.collection.title));
      
      for (const rule of activeRules) {
        const titleLower = rule.collection.title.toLowerCase();
        const tagMatches = payloadTags.some((tag: string) => 
          titleLower.includes(tag) || tag.includes(titleLower)
        );

        if (
          productCollections.includes(rule.collection.shopifyCollectionId) ||
          tagMatches
        ) {
          appliedRule = rule;
          break;
        }
      }
    } catch (err: any) {
      console.error("[SKU Generator] Failed to fetch collections for product:", err.message);
    }
  }

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

    if (!variantBase && variant.sku && variant.sku !== "N/A" && variant.sku.trim() !== "") {
      continue; // keep existing valid SKU
    }

    let sequenceToUse = 1;

    if (!variantBase) {
      // ALWAYS increment global sequence, even if a collection rule is applied
      const updatedSetting = await prisma.storeSetting.update({
        where: { storeId: store.id },
        data: { skuSequence: { increment: 1 } },
        select: { skuSequence: true }
      });
      sequenceToUse = updatedSetting.skuSequence - 1;

      variantBase = await prisma.variantBaseSku.create({
        data: {
          storeId: store.id,
          shopifyVariantId: numericVariantId,
          baseSequence: sequenceToUse
        }
      });
    } else {
      sequenceToUse = variantBase.baseSequence;
    }

    const paddedSequence = sequenceToUse.toString().padStart(4, '0');

    let optionsStr = "";
    if (variant.title && variant.title !== 'Default Title') {
      optionsStr = variant.title.toUpperCase().replace(/[\s\/]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    } else {
      const opts = [variant.option1, variant.option2, variant.option3].filter(Boolean);
      if (opts.length > 0 && opts[0] !== 'Default Title') {
        optionsStr = opts.map((o: any) => o.toString().toUpperCase().replace(/[\s\/]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')).join('-');
      }
    }

    let expectedSku = "";
    
    // Format: STB-HELLO-COLLECTION-L-0023 or STB-HELLO-COLLECTION-0023
    if (appliedRule) {
      const globPrefix = setting.skuPrefix || "SKU";
      
      let colPrefix = appliedRule.skuPrefix?.trim();
      if (!colPrefix) {
        const words = appliedRule.collection.title.trim().split(/[\s\-]+/).filter((w: string) => w.length > 0);
        if (words.length === 1) {
          colPrefix = words[0].substring(0, 3).toUpperCase();
        } else if (words.length === 2) {
          colPrefix = (words[0][0] + words[1].substring(0, 2)).toUpperCase();
        } else if (words.length >= 3) {
          colPrefix = (words[0][0] + words[1][0] + words[2][0]).toUpperCase();
        }
        colPrefix = (colPrefix || 'COL').padEnd(3, 'X').substring(0, 3);
      }
      
      if (optionsStr) {
        expectedSku = `${globalPrefix}-${globPrefix}-${colPrefix}-${optionsStr}-${paddedSequence}`;
      } else {
        expectedSku = `${globalPrefix}-${globPrefix}-${colPrefix}-${paddedSequence}`;
      }
    } else {
      const globPrefix = setting.skuPrefix || "SKU";
      if (optionsStr) {
        expectedSku = `${globalPrefix}-${globPrefix}-${optionsStr}-${paddedSequence}`;
      } else {
        expectedSku = `${globalPrefix}-${globPrefix}-${paddedSequence}`;
      }
    }

    if (variant.sku !== expectedSku) {
      variant.sku = expectedSku;
      variantsToUpdate.push(variant);
    }
  }

  if (variantsToUpdate.length > 0) {
    try {
      const client = await getAdminClient(shopDomain);
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
          productId: graphqlProductId,
          variants: formattedVariants
        }
      });
      console.log(`[SKU Generator] Successfully updated ${variantsToUpdate.length} variant SKUs for Product ${graphqlProductId}`);
    } catch (err: any) {
      console.error(`[SKU Generator] Failed to push SKUs back to Shopify:`, err.message);
    }
  }

  return payload;
}
