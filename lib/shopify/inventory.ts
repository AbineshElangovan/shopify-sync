import { getAdminClient } from "./admin";

/**
 * Updates the inventory quantity for a specific inventory item at a specific location.
 * 
 * @param shopDomain The Shopify domain of the destination store
 * @param inventoryItemId The global ID of the inventory item (gid://shopify/InventoryItem/...)
 * @param locationId The global ID of the location (gid://shopify/Location/...)
 * @param quantity The new available quantity to set
 */
export async function getInventoryItemSku(shopDomain: string, inventoryItemId: string) {
  const client = await getAdminClient(shopDomain);
  
  const query = `
    query getInventoryItemSku($id: ID!) {
      inventoryItem(id: $id) {
        sku
      }
    }
  `;

  const response = await client.request(query, { variables: { id: inventoryItemId } });
  return response.data?.inventoryItem?.sku;
}

export async function updateInventoryQuantity(
  shopDomain: string,
  inventoryItemId: string,
  locationId: string,
  quantity: number
) {
  const client = await getAdminClient(shopDomain);

  const mutation = `
    mutation inventorySetOnHandQuantities($input: InventorySetOnHandQuantitiesInput!) {
      inventorySetOnHandQuantities(input: $input) {
        inventoryAdjustmentGroup {
          id
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const variables = {
    input: {
      reason: "correction",
      setQuantities: [
        {
          inventoryItemId,
          locationId,
          quantity,
        },
      ],
    },
  };

  const response = await client.request(mutation, { variables });
  
  if (response.data?.inventorySetOnHandQuantities?.userErrors?.length > 0) {
    const errors = response.data.inventorySetOnHandQuantities.userErrors
      .map((e: any) => e.message)
      .join(", ");
    throw new Error(`Failed to update inventory: ${errors}`);
  }

  return response.data?.inventorySetOnHandQuantities?.inventoryAdjustmentGroup;
}
