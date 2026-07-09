// ============================================================
// Shop GraphQL Queries
// ============================================================

/**
 * Fetches basic shop information.
 * Used by: lib/shopify/admin.ts (fetchShopInfo), services/shopify/bulk-sync.ts (syncStoreA)
 */
export const SHOP_INFO_QUERY = `
  query {
    shop {
      id
      name
      email
      myshopifyDomain
    }
  }
`;
