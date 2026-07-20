import { getAdminClient } from '@/lib/shopify/admin';

const GET_FULL_PRODUCT_QUERY = `
  query getFullProduct($id: ID!) {
    product(id: $id) {
      id
      title
      handle
      descriptionHtml
      vendor
      productType
      status
      tags
      images(first: 10) {
        edges {
          node {
            url
            altText
          }
        }
      }
      collections(first: 10) {
        edges {
          node {
            id
            title
            handle
          }
        }
      }
      options {
        name
        position
        values
      }
      variants(first: 50) {
        edges {
          node {
            id
            title
            price
            sku
            selectedOptions {
              name
              value
            }
            inventoryItem {
              id
              inventoryLevels(first: 10) {
                edges {
                  node {
                    quantities(names: ["available"]) {
                      quantity
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`;

export async function fetchLatestShopifyProduct(shopDomain: string, productId: string | number) {
  const client = await getAdminClient(shopDomain);
  
  // Ensure we have a GID
  const productIdGid = String(productId).includes('gid://') 
    ? String(productId) 
    : `gid://shopify/Product/${productId}`;

  try {
    const response: any = await client.request(GET_FULL_PRODUCT_QUERY, {
      variables: { id: productIdGid }
    });

    const product = response.data?.product;
    if (!product) {
      console.warn(`[ProductFetcher] Product ${productIdGid} not found on ${shopDomain}`);
      return null;
    }

    // Extract numeric ID from GID
    const numericProductId = product.id.split('/').pop();

    const formattedPayload: any = {
      id: parseInt(numericProductId, 10),
      admin_graphql_api_id: product.id,
      title: product.title,
      handle: product.handle,
      body_html: product.descriptionHtml,
      vendor: product.vendor,
      product_type: product.productType,
      status: product.status?.toLowerCase(),
      tags: product.tags?.join(', '),
      
      options: product.options?.map((opt: any) => ({
        name: opt.name,
        position: opt.position,
        values: opt.values,
      })) || [],

      images: product.images?.edges?.map((edge: any) => ({
        src: edge.node.url,
        alt: edge.node.altText || null
      })) || [],

      _collections: product.collections?.edges?.map((edge: any) => ({
        id: edge.node.id,
        title: edge.node.title,
        handle: edge.node.handle
      })) || [],
      
      variants: product.variants?.edges?.map((edge: any) => {
        const variant = edge.node;
        const numericVariantId = variant.id.split('/').pop();
        const numericInventoryItemId = variant.inventoryItem?.id?.split('/').pop();
        
        let inventoryQuantity = 0;
        const levels = variant.inventoryItem?.inventoryLevels?.edges || [];
        for (const levelEdge of levels) {
          const qty = levelEdge.node.quantities?.[0]?.quantity;
          if (typeof qty === 'number') {
            inventoryQuantity += qty;
          }
        }

        const option1 = variant.selectedOptions?.[0]?.value || null;
        const option2 = variant.selectedOptions?.[1]?.value || null;
        const option3 = variant.selectedOptions?.[2]?.value || null;

        return {
          id: parseInt(numericVariantId, 10),
          product_id: parseInt(numericProductId, 10),
          admin_graphql_api_id: variant.id,
          title: variant.title,
          price: variant.price,
          sku: variant.sku || '',
          inventory_item_id: parseInt(numericInventoryItemId, 10),
          inventory_quantity: inventoryQuantity,
          option1,
          option2,
          option3
        };
      }) || []
    };

    if (formattedPayload.images.length > 0) {
      formattedPayload.image = formattedPayload.images[0];
    }

    console.log(`[ProductFetcher] Successfully fetched and normalized latest data for ${product.id}`);
    return formattedPayload;
  } catch (error: any) {
    console.error(`[ProductFetcher] Error fetching product ${productIdGid}:`, error.message);
    throw error;
  }
}
