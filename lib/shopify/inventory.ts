import { getAdminClient } from './admin';
import crypto from 'crypto';
import { INVENTORY_SET_MUTATION, GET_INVENTORY_ITEM_QUERY, INVENTORY_ADJUST_MUTATION } from '@/services/shopify/graphql';

export async function setInventoryQuantity(
  shopDomain: string,
  inventoryItemId: string,
  locationId: string,
  quantity: number
) {
  const client = await getAdminClient(shopDomain);
  
  try {
    const response = await client.request(INVENTORY_SET_MUTATION, {
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
    const response = await client.request(GET_INVENTORY_ITEM_QUERY, { variables: { id: inventoryItemId } });

    return response.data?.inventoryItem;
  } catch (error) {
    console.error(`Error fetching inventory item for ${shopDomain}:`, error);
    throw error;
  }
}

export async function adjustInventoryQuantity(
  shopDomain: string,
  inventoryItemId: string,
  locationId: string,
  delta: number
) {
  const client = await getAdminClient(shopDomain);
  
  try {
    const response = await client.request(INVENTORY_ADJUST_MUTATION, {
      variables: {
        input: {
          name: "available",
          reason: "correction",
          changes: [
            {
              inventoryItemId: inventoryItemId,
              locationId: locationId,
              delta: delta
            }
          ]
        },
        idempotencyKey: crypto.randomUUID()
      }
    });

    const userErrors = response.data?.inventoryAdjustQuantities?.userErrors;
    if (userErrors && userErrors.length > 0) {
      throw new Error(`Failed to adjust inventory: ${userErrors.map((e: any) => e.message).join(', ')}`);
    }

    return response.data?.inventoryAdjustQuantities?.inventoryAdjustmentGroup;
  } catch (error) {
    console.error(`Error adjusting inventory for ${shopDomain}:`, error);
    throw error;
  }
}
