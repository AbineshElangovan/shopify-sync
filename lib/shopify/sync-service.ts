import { prisma } from "@/lib/db/prisma";
import { getInventoryItemSku, updateInventoryQuantity } from "./inventory";
import { createSyncLog } from "./sync-log";

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

export async function processInventoryUpdate(shopDomain: string, payload: any, webhookId: string) {
  const inventoryItemIdNumber = payload.inventory_item_id;
  const availableQuantity = payload.available;
  
  if (!inventoryItemIdNumber || availableQuantity === undefined) {
    console.warn("Invalid payload for inventory_levels/update:", payload);
    return;
  }

  const formattedInventoryItemId = inventoryItemIdNumber.toString().includes("gid://")
    ? inventoryItemIdNumber.toString()
    : `gid://shopify/InventoryItem/${inventoryItemIdNumber}`;

  const sourceStore = await prisma.store.findUnique({
    where: { shopDomain },
  });

  if (!sourceStore) {
    console.warn(`Source store ${shopDomain} not found in database.`);
    return;
  }

  // Try to find the variant map for this inventory item in the source store
  let sku: string | null = null;
  const sourceVariantMap = await prisma.variantMap.findFirst({
    where: {
      storeId: sourceStore.id,
      inventoryItemId: {
        endsWith: inventoryItemIdNumber.toString()
      }
    },
  });

  if (sourceVariantMap) {
    sku = sourceVariantMap.sku;
  } else {
    // Fallback: Retrieve the latest product and inventory information using the Shopify Admin GraphQL API
    sku = await getInventoryItemSku(shopDomain, formattedInventoryItemId);
  }

  if (!sku) {
    console.warn(`No SKU found for inventory item ${inventoryItemIdNumber} in store ${shopDomain}. Ignored.`);
    return;
  }

  console.log(`Inventory update for SKU ${sku} triggered by ${shopDomain}. New Quantity: ${availableQuantity}`);

  // Find destination variant maps (other stores mapping the same SKU)
  const destinationVariantMaps = await prisma.variantMap.findMany({
    where: {
      sku: sku,
      storeId: { not: sourceStore.id }
    },
    include: {
      store: true
    }
  });

  if (destinationVariantMaps.length === 0) {
    console.log(`No destination stores found mapping SKU ${sku}.`);
    return;
  }

  // Process each destination store
  for (const destMap of destinationVariantMaps) {
    const destStore = destMap.store;
    
    if (!destStore.isActive) {
      console.log(`Skipping inactive store ${destStore.shopDomain}`);
      continue;
    }

    if (!destMap.locationId) {
      console.warn(`No location ID mapped for SKU ${sku} in destination store ${destStore.shopDomain}. Sync skipped.`);
      await createSyncLog({
        sku,
        sourceStoreId: sourceStore.id,
        destinationStoreId: destStore.id,
        previousQuantity: 0,
        updatedQuantity: availableQuantity,
        status: "FAILED",
        failureReason: "No location mapped in destination store.",
        webhookEventId: webhookId
      });
      continue;
    }

    await syncToDestinationWithRetry(
      sourceStore.id,
      destStore,
      sku,
      destMap.inventoryItemId,
      destMap.locationId,
      availableQuantity,
      webhookId
    );
  }
}

async function syncToDestinationWithRetry(
  sourceStoreId: string,
  destStore: any,
  sku: string,
  inventoryItemId: string,
  locationId: string,
  targetQuantity: number,
  webhookId: string,
  maxRetries = 3
) {
  let attempt = 0;
  let success = false;
  let lastError = "";

  while (attempt < maxRetries && !success) {
    attempt++;
    try {
      await updateInventoryQuantity(destStore.shopDomain, inventoryItemId, locationId, targetQuantity);
      success = true;
      console.log(`Successfully synced SKU ${sku} to ${destStore.shopDomain}.`);
    } catch (error: any) {
      lastError = error.message;
      console.error(`Sync attempt ${attempt} failed for SKU ${sku} to ${destStore.shopDomain}: ${lastError}`);
      if (attempt < maxRetries) {
        await delay(1000 * attempt); // simple exponential backoff
      }
    }
  }

  await createSyncLog({
    sku,
    sourceStoreId,
    destinationStoreId: destStore.id,
    previousQuantity: 0, // Assuming 0 as we don't query the destination before setting
    updatedQuantity: targetQuantity,
    status: success ? "SUCCESS" : "FAILED",
    failureReason: success ? undefined : `Failed after ${maxRetries} attempts: ${lastError}`,
    webhookEventId: webhookId
  });
}
