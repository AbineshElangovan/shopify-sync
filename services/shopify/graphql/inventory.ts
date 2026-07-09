// ============================================================
// Inventory GraphQL Queries & Mutations
// ============================================================

/**
 * Sets inventory quantities for an item at a location.
 * Used by: lib/shopify/inventory.ts (setInventoryQuantity)
 */
export const INVENTORY_SET_MUTATION = `
  mutation inventorySetQuantities($input: InventorySetQuantitiesInput!, $idempotencyKey: String!) {
    inventorySetQuantities(input: $input) @idempotent(key: $idempotencyKey) {
      inventoryAdjustmentGroup {
        createdAt
        reason
        changes {
          name
          delta
          quantityAfterChange
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
 * Fetches a single inventory item with its levels across locations.
 * Used by: lib/shopify/inventory.ts (getInventoryItem)
 */
export const GET_INVENTORY_ITEM_QUERY = `
  query getInventoryItem($id: ID!) {
    inventoryItem(id: $id) {
      id
      sku
      inventoryLevels(first: 5) {
        edges {
          node {
            id
            quantities(names: ["available"]) {
              name
              quantity
            }
            location {
              id
              name
            }
          }
        }
      }
    }
  }
`;

/**
 * Fetches inventory levels for a specific inventory item.
 * Used by: lib/shopify/admin.ts (fetchInventoryLevels)
 */
export const GET_INVENTORY_LEVELS_QUERY = `
  query getInventory($id: ID!) {
    inventoryItem(id: $id) {
      inventoryLevels(first: 10) {
        edges {
          node {
            id
            quantities(names: ["available"]) {
              name
              quantity
            }
            location {
              id
              name
            }
          }
        }
      }
    }
  }
`;
