import { prisma } from "@/lib/db/prisma";

/**
 * Format a sequence number into a standard PID string (e.g. PID-00000001)
 */
function formatUniqueId(sequence: number): string {
  return `PID-${String(sequence).padStart(8, '0')}`;
}

/**
 * [MASTER STORE CREATE]
 * Generates a brand new Unique ID for a product created on the Master Store
 * and saves its initial mapping.
 */
export async function createMasterProductMapping(
  storeId: string,
  shopifyProductId: string,
  shopifyVariantId: string,
  sku: string | null = null,
  inventoryItemId: string | null = null
) {
  // Use a transaction to guarantee atomic sequence generation and identity saving
  return await prisma.$transaction(async (tx) => {
    // 1. Read and increment the sequence atomically
    const sequenceRecord = await tx.productUniqueIdSequence.upsert({
      where: { id: 'product' },
      update: { currentSequence: { increment: 1 } },
      create: { id: 'product', currentSequence: 1 },
    });

    const newUniqueId = formatUniqueId(sequenceRecord.currentSequence);

    const store = await tx.store.findUnique({ where: { id: storeId }});
    const storeName = store?.shopDomain || null;

    // 2. Save the mapping record for the master store
    const mapping = await tx.productMapping.create({
      data: {
        productUniqueId: newUniqueId,
        storeId,
        storeName,
        shopifyProductId,
        shopifyVariantId,
        inventoryItemId,
        sku
      }
    });

    return mapping;
  });
}

/**
 * [CONNECTED STORE SYNC]
 * Takes an existing Unique ID (from the master) and links a connected store's product to it.
 */
export async function linkConnectedProductMapping(
  masterUniqueId: string,
  storeId: string,
  shopifyProductId: string,
  shopifyVariantId: string,
  sku: string | null = null,
  inventoryItemId: string | null = null
) {
  const store = await prisma.store.findUnique({ where: { id: storeId }});
  const storeName = store?.shopDomain || null;

  return await prisma.productMapping.upsert({
    where: {
      storeId_shopifyVariantId: {
        storeId,
        shopifyVariantId
      }
    },
    update: {
      productUniqueId: masterUniqueId,
      storeName,
      shopifyProductId,
      inventoryItemId,
      sku
    },
    create: {
      productUniqueId: masterUniqueId,
      storeId,
      storeName,
      shopifyProductId,
      shopifyVariantId,
      inventoryItemId,
      sku
    }
  });
}

/**
 * [PRIMARY LOOKUP]
 * Finds all mappings across all stores for a given Unique ID.
 * This is the core logic for fast, unbreakable syncs.
 */
export async function findMappingsByUniqueId(productUniqueId: string) {
  return await prisma.productMapping.findMany({
    where: { productUniqueId }
  });
}

/**
 * [FALLBACK RECOVERY]
 * Finds a mapping by SKU for a specific store.
 * Used only when the Unique ID lookup fails (e.g. manual deletion/recreation by merchant).
 */
export async function findMappingBySku(storeId: string, sku: string) {
  return await prisma.productMapping.findFirst({
    where: { 
      storeId,
      sku 
    }
  });
}

/**
 * Find the mapping for a specific store variant directly.
 */
export async function findMappingByVariantId(storeId: string, shopifyVariantId: string) {
  return await prisma.productMapping.findUnique({
    where: {
      storeId_shopifyVariantId: {
        storeId,
        shopifyVariantId
      }
    }
  });
}

/**
 * [DELETE]
 * Deletes all mappings associated with a specific store product.
 */
export async function deleteMappingsForProduct(storeId: string, shopifyProductId: string) {
  const result = await prisma.productMapping.deleteMany({
    where: {
      storeId,
      shopifyProductId
    }
  });
  return result.count > 0;
}
