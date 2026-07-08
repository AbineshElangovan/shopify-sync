import { getAdminClient } from './admin';
import crypto from 'crypto';

export async function setInventoryQuantity(
  shopDomain: string,
  inventoryItemId: string,
  locationId: string,
  quantity: number
) {
  const client = await getAdminClient(shopDomain);
  
  try {
    const response = await client.request(`
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
    `, {
      variables: {
        input: {
          name: "available",
          reason: "correction",
          quantities: [
            {
              inventoryItemId: inventoryItemId,
              locationId: locationId,
              quantity: quantity,
              changeFromQuantity: null
            }
          ]
        },
        idempotencyKey: crypto.randomUUID()
      }
    });

    const userErrors = response.data?.inventorySetQuantities?.userErrors;
    if (userErrors && userErrors.length > 0) {
      throw new Error(`Failed to set inventory: ${userErrors.map((e: any) => e.message).join(', ')}`);
    }

    return response.data?.inventorySetQuantities?.inventoryAdjustmentGroup;
  } catch (error) {
    console.error(`Error setting inventory for ${shopDomain}:`, error);
    throw error;
  }
}

export async function getInventoryItem(shopDomain: string, inventoryItemId: string) {
  const client = await getAdminClient(shopDomain);

  try {
    const response = await client.request(`
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
    `, { variables: { id: inventoryItemId } });

    return response.data?.inventoryItem;
  } catch (error) {
    console.error(`Error fetching inventory item for ${shopDomain}:`, error);
    throw error;
  }
}
