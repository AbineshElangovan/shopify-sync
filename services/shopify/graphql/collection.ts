// ============================================================
// Collection GraphQL Queries
// ============================================================

/**
 * Fetches all collections for a store.
 * Used by: lib/shopify/sync-service.ts, services/shopify/bulk-sync.ts
 */
export const GET_COLLECTIONS_QUERY = `
  query getCollections($first: Int!) {
    collections(first: $first) {
      edges {
        node {
          id
          title
          handle
        }
      }
    }
  }
`;

/**
 * Fetches all product IDs within a specific collection.
 * Used by: lib/shopify/sync-service.ts, services/shopify/bulk-sync.ts
 */
export const GET_COLLECTION_PRODUCTS_QUERY = `
  query getCollectionProducts($id: ID!, $first: Int!) {
    collection(id: $id) {
      products(first: $first) {
        edges {
          node {
            id
          }
        }
      }
    }
  }
`;
