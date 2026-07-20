import { getAdminClient } from "@/lib/shopify/admin";
import { getVendorCode } from "./vendor";
import { getNextSequence } from "./sequence";

export function getAppPrefix(): string {
  return process.env.APP_PREFIX || "MSI";
}

const PRODUCT_VARIANTS_BULK_UPDATE_MUTATION = `
  mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
      product {
        id
      }
      productVariants {
        id
        sku
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export async function generateSkusForProductIfNeeded(shopDomain: string, payload: any): Promise<any> {
  const fs = require('fs');
  const logFile = 'C:/Users/eabin/OneDrive/Desktop/next task/shopify-sync/sku-debug.log';
  const log = (msg: string) => fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${msg}\n`);

  if (!payload.variants || !Array.isArray(payload.variants)) {
    log(`No variants found in payload for product ${payload.id}`);
    return payload;
  }

  const appPrefix = getAppPrefix();
  let vendorCode: string | null = null; // Lazy load only if needed

  let client: any = null;

  for (const variant of payload.variants) {
    const existingSku = variant.sku?.trim();
    if (!existingSku) {
      log(`Variant ${variant.id} has no SKU. Generating...`);
      if (!vendorCode) {
        vendorCode = await getVendorCode(payload.vendor);
        log(`Vendor code resolved: ${vendorCode}`);
      }
      if (!client) {
        client = await getAdminClient(shopDomain);
      }

      const seq = await getNextSequence(vendorCode);
      const paddedSeq = seq.toString().padStart(6, "0");
      const generatedSku = `${appPrefix}-${vendorCode}-${paddedSeq}`;
      log(`Generated SKU: ${generatedSku} for variant ${variant.id}`);

      const variantIdGid = `gid://shopify/ProductVariant/${variant.id}`;
      
      let retryCount = 0;
      let success = false;
      const MAX_RETRIES = 3;

      while (retryCount < MAX_RETRIES && !success) {
        try {
          const productIdGid = `gid://shopify/Product/${payload.id}`;
          const response: any = await client.request(PRODUCT_VARIANTS_BULK_UPDATE_MUTATION, {
            variables: {
              productId: productIdGid,
              variants: [
                {
                  id: variantIdGid,
                  inventoryItem: {
                    sku: generatedSku
                  }
                }
              ]
            }
          });

          const userErrors = response?.data?.productVariantsBulkUpdate?.userErrors || [];
          if (userErrors.length > 0) {
            log(`Failed to update Shopify (userErrors): ${JSON.stringify(userErrors)}`);
            console.error(`[SKU Generator] Failed to update SKU in Shopify for ${variantIdGid}:`, userErrors.map((e: any) => e.message).join(", "));
            // Do not retry on validation user errors
            break;
          }

          success = true;
          log(`Successfully updated Shopify for variant ${variant.id}`);
        } catch (err: any) {
          retryCount++;
          log(`Attempt ${retryCount} failed: ${err.message}`);
          console.error(`[SKU Generator] Error updating SKU ${generatedSku} for variant ${variant.id} (Attempt ${retryCount}):`, err.message);
          if (retryCount >= MAX_RETRIES) {
            break;
          }
          // Exponential backoff
          await new Promise(resolve => setTimeout(resolve, retryCount * 500));
        }
      }

      if (success) {
        // Successfully updated in Shopify, mutate payload so downstream sync uses this SKU
        variant.sku = generatedSku;
        log(`Saved SKU ${generatedSku} to payload.`);
        console.log(`[SKU Generator] Generated and saved SKU ${generatedSku} for variant ${variant.id}`);
      } else {
        log(`Failed to save SKU ${generatedSku} to payload because Shopify update failed.`);
      }
    }
  }

  return payload;
}
