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
