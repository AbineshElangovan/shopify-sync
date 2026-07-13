
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

/**
 * Creates a new custom collection.
 */
export const CREATE_COLLECTION_MUTATION = `
  mutation collectionCreate($input: CollectionInput!) {
    collectionCreate(input: $input) {
      collection {
        id
        title
        handle
      }
      userErrors {
        field
        message
      }
    }
  }
`;

/**
 * Searches for collections by title.
 */
export const GET_COLLECTIONS_BY_TITLE_QUERY = `
  query getCollectionsByTitle($query: String!, $first: Int!) {
    collections(first: $first, query: $query) {
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
 * Adds a product to a collection.
 * Note: Only works for custom collections.
 */
export const ADD_PRODUCT_TO_COLLECTION_MUTATION = `
  mutation collectionAddProducts($id: ID!, $productIds: [ID!]!) {
    collectionAddProducts(id: $id, productIds: $productIds) {
      collection {
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
 * Fetches collections assigned to a specific product.
 */
export const GET_PRODUCT_COLLECTIONS_QUERY = `
  query getProductCollections($id: ID!) {
    product(id: $id) {
      collections(first: 20) {
        edges {
          node {
            id
            title
            handle
          }
        }
      }
    }
  }
`;
