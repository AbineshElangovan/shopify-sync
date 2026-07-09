
/**
 * Fetches the first location for a store.
 * Used by: services/shopify/product-sync.ts (processProductCreate)
 */
export const LOCATIONS_QUERY = `
  query {
    locations(first: 1) {
      edges {
        node {
          id
        }
      }
    }
  }
`;
