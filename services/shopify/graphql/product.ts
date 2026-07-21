
/**
 * Fetches products with full variant, inventory, and collection data.
 * Used by: services/shopify/bulk-sync.ts (syncStoreProducts)
 */
export const GET_PRODUCTS_QUERY = `
  query getProducts($first: Int!, $after: String) {
    products(first: $first, after: $after) {
      edges {
        node {
          id
          title
          handle
          featuredImage {
            url
          }
          collections(first: 20) {
            edges {
              node {
                id
                title
                handle
              }
            }
          }
          variants(first: 50) {
            edges {
              node {
                id
                title
                sku
                price
                inventoryItem {
                  id
                  inventoryLevels(first: 10) {
                    edges {
                      node {
                        quantities(names: ["available"]) {
                          name
                          quantity
                        }
                        location {
                          id
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
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

/**
 * Fetches products with basic info (no inventory levels or collections).
 * Used by: lib/shopify/admin.ts (fetchProducts)
 */
export const GET_PRODUCTS_BASIC_QUERY = `
  query getProducts($first: Int!) {
    products(first: $first) {
      edges {
        node {
          id
          title
          handle
          updatedAt
          variants(first: 5) {
            edges {
              node {
                id
                title
                sku
                price
              }
            }
          }
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
 * Fetches products with inventory levels for initial sync.
 * Used by: lib/shopify/sync-service.ts (syncStoreProducts)
 */
export const GET_PRODUCTS_SYNC_QUERY = `
  query getProducts($first: Int!) {
    products(first: $first) {
      edges {
        node {
          id
          title
          handle
          variants(first: 10) {
            edges {
              node {
                id
                title
                sku
                price
                inventoryItem {
                  id
                  inventoryLevels(first: 5) {
                    edges {
                      node {
                        quantities(names: ["available"]) {
                          name
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
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

/**
 * Fetches products with inventory and price data for syncStoreA.
 * Used by: services/shopify/bulk-sync.ts (syncStoreA)
 */
export const GET_PRODUCTS_WITH_INVENTORY_QUERY = `
  query getProducts($first: Int!) {
    products(first: $first) {
      edges {
        node {
          id
          title
          handle
          featuredImage {
            url
          }
          variants(first: 50) {
            edges {
              node {
                id
                title
                sku
                price
                inventoryItem {
                  id
                  inventoryLevels(first: 10) {
                    edges {
                      node {
                        quantities(names: ["available"]) {
                          name
                          quantity
                        }
                        location {
                          id
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
    }
  }
`;

/**
 * Fetches a single product by ID with full detail for sync comparison.
 * Used by: services/shopify/product-sync.ts (processProductUpdate)
 */
export const GET_PRODUCT_BY_ID_QUERY = `
  query getProduct($id: ID!) {
    product(id: $id) {
      id
      title
      descriptionHtml
      vendor
      productType
      status
      updatedAt
      variants(first: 50) {
        edges {
          node {
            id
            title
            sku
            price
            inventoryItem {
              id
            }
          }
        }
      }
    }
  }
`;

/**
 * Looks up product variants by SKU.
 * Used by: services/shopify/product-sync.ts (processProductCreate, processProductUpdate, processProductDelete)
 */
export const GET_VARIANT_BY_SKU_QUERY = `
  query getVariantBySku($query: String!) {
    productVariants(first: 5, query: $query) {
      edges {
        node {
          id
          sku
          price
          product {
            id
            title
          }
          inventoryItem {
            id
          }
        }
      }
    }
  }
`;

/**
 * Fetches variants for a specific product.
 * Used by: lib/shopify/admin.ts (fetchProductVariants)
 */
export const GET_PRODUCT_VARIANTS_QUERY = `
  query getVariants($id: ID!, $first: Int!) {
    product(id: $id) {
      variants(first: $first) {
        edges {
          node {
            id
            title
            sku
            inventoryItem {
              id
            }
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
`;

/**
 * Creates or updates a product (upsert by SKU).
 * Used by: services/shopify/product-sync.ts (processProductCreate, processProductUpdate)
 */
export const PRODUCT_SET_MUTATION = `
  mutation productSet($input: ProductSetInput!) {
    productSet(input: $input) {
      product {
        id
        title
        variants(first: 50) {
          edges {
            node {
              id
              title
              sku
              price
              inventoryItem {
                id
              }
            }
          }
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

/**
 * Deletes a product by ID.
 * Used by: services/shopify/product-sync.ts (processProductDelete)
 */
export const PRODUCT_DELETE_MUTATION = `
  mutation productDelete($input: ProductDeleteInput!) {
    productDelete(input: $input) {
      deletedProductId
      userErrors {
        field
        message
      }
    }
  }
`;

/**
 * Bulk-deletes product variants.
 * Used by: services/shopify/product-sync.ts (processProductUpdate)
 */
export const PRODUCT_VARIANTS_DELETE_MUTATION = `
  mutation productVariantsBulkDelete($productId: ID!, $variantsIds: [ID!]!) {
    productVariantsBulkDelete(productId: $productId, variantsIds: $variantsIds) {
      product {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

/**
 * Fetches all publications (sales channels) for a store.
 * Used by: services/shopify/product-sync.ts
 */
export const GET_PUBLICATIONS_QUERY = `
  query getPublications {
    publications(first: 20) {
      edges {
        node {
          id
          name
        }
      }
    }
  }
`;

/**
 * Publishes a product to specified publications.
 * Used by: services/shopify/product-sync.ts
 */
export const PUBLISH_MUTATION = `
  mutation publishablePublish($id: ID!, $input: [PublicationInput!]!) {
    publishablePublish(id: $id, input: $input) {
      userErrors {
        field
        message
      }
    }
  }
`;
