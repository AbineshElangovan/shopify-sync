import { prisma } from '@/lib/db/prisma';
import { getAdminClient } from '@/lib/shopify/admin';
import { setInventoryQuantity } from '@/lib/shopify/inventory';
import { createSyncLog } from '@/lib/shopify/sync-log';
import { linkConnectedProductMapping, findMappingByVariantId } from '@/services/product-mapping';
import {
  PRODUCT_SET_MUTATION, PRODUCT_DELETE_MUTATION, PRODUCT_VARIANTS_DELETE_MUTATION,
  GET_VARIANT_BY_SKU_QUERY, GET_PRODUCT_BY_ID_QUERY, LOCATIONS_QUERY,
  GET_PRODUCT_COLLECTIONS_QUERY, GET_COLLECTIONS_BY_TITLE_QUERY, CREATE_COLLECTION_MUTATION,
  ADD_PRODUCT_TO_COLLECTION_MUTATION, GET_PUBLICATIONS_QUERY, PUBLISH_MUTATION
} from './graphql';
import { syncProductCollectionsByTags } from './collection-sync';

export async function fetchDefaultLocation(shopDomain: string): Promise<string | null> {
  try {
    const client = await getAdminClient(shopDomain);
    const response: any = await client.request(LOCATIONS_QUERY);
    return response?.data?.locations?.edges?.[0]?.node?.id || null;
  } catch (error) {
    console.error(`[ProductSync] Failed to fetch location for ${shopDomain}:`, error);
    return null;
  }
}

export async function publishProductToAllChannels(shopDomain: string, productId: string) {
  try {
    const client = await getAdminClient(shopDomain);
    const pubResponse: any = await client.request(GET_PUBLICATIONS_QUERY);
    const publications = pubResponse?.data?.publications?.edges || [];

    if (publications.length === 0) return;

    const publicationInputs = publications.map((edge: any) => ({
      publicationId: edge.node.id
    }));

    const response: any = await client.request(PUBLISH_MUTATION, {
      variables: {
        id: productId,
        input: publicationInputs
      }
    });

    const userErrors = response?.data?.publishablePublish?.userErrors || [];
    if (userErrors.length > 0) {
      console.error(`[ProductSync:Publish] Failed to publish ${productId} in ${shopDomain}:`, userErrors);
    } else {
      console.log(`[ProductSync:Publish] Successfully published ${productId} to ${publications.length} channels in ${shopDomain}`);
    }
  } catch (error: any) {
    console.error(`[ProductSync:Publish] Error publishing ${productId} in ${shopDomain}:`, error.message);
  }
}

export async function findTargetProductBySku(shopDomain: string, sku: string) {
  try {
    const client = await getAdminClient(shopDomain);
    const response: any = await client.request(GET_VARIANT_BY_SKU_QUERY, {
      variables: { query: `sku:${sku}` },
    });
    const edges = response?.data?.productVariants?.edges || [];
    for (const edge of edges) {
      const node = edge.node;
      if (node.sku?.trim().toLowerCase() === sku.trim().toLowerCase()) {
        return {
          productId: node.product?.id,
          variantId: node.id,
          inventoryItemId: node.inventoryItem?.id,
          price: node.price,
        };
      }
    }
  } catch (error: any) {
    console.error(`[ProductSync:Lookup] SKU lookup failed for ${sku} in ${shopDomain}:`, error.message);
  }
  return null;
}
