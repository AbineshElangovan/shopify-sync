import { prisma } from "@/lib/db/prisma";

/**
 * Format a sequence number into a standard PID string (e.g. PID-00000001)
 */
function formatUniqueId(sequence: number): string {
  return `PID-${String(sequence).padStart(8, '0')}`;
}

/**
 * Atomically generate a new Product Unique ID within a transaction.
 */
export async function generateProductIdentity(
  storeId: string,
  shopifyProductId: string,
  shopifyVariantId: string
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

    // 2. Save the identity record
    const identity = await tx.productUniqueIdentity.create({
      data: {
        uniqueId: newUniqueId,
        storeId,
        shopifyProductId,
        shopifyVariantId,
        isArchived: false
      }
    });

    return identity;
  });
}

/**
 * [Product Create Flow]
 * Safely get or create a product identity.
 * Contains idempotency logic to handle duplicate webhooks gracefully.
 */
export async function getOrCreateProductIdentity(
  storeId: string,
  shopifyProductId: string,
  shopifyVariantId: string
) {
  // Check if it already exists (Idempotency)
  const existing = await prisma.productUniqueIdentity.findUnique({
    where: {
      storeId_shopifyVariantId: {
        storeId,
        shopifyVariantId
      }
    }
  });

  if (existing) {
    if (existing.isArchived) {
      return await prisma.productUniqueIdentity.update({
        where: { id: existing.id },
        data: { isArchived: false }
      });
    }
    return existing;
  }

  // Generate new identity
  return await generateProductIdentity(storeId, shopifyProductId, shopifyVariantId);
}

/**
 * [Product Update Flow]
 * Strictly requires an existing identity. Does not auto-generate.
 */
export async function requireProductIdentity(
  storeId: string,
  shopifyProductId: string,
  shopifyVariantId: string
) {
  const existing = await prisma.productUniqueIdentity.findUnique({
    where: {
      storeId_shopifyVariantId: {
        storeId,
        shopifyVariantId
      }
    }
  });

  if (!existing) {
    throw new Error(`Data Inconsistency: Product Identity missing for variant ${shopifyVariantId} on store ${storeId} during update.`);
  }

  if (existing.isArchived) {
    return await prisma.productUniqueIdentity.update({
      where: { id: existing.id },
      data: { isArchived: false }
    });
  }

  return existing;
}

/**
 * [Product Sync Flow]
 * Uses Master Store identity to clone an identity for the Target Store.
 * Throws an error if the Master Store lacks an identity.
 */
export async function syncProductIdentity(
  masterStoreId: string,
  masterVariantId: string,
  targetStoreId: string,
  targetProductId: string,
  targetVariantId: string
) {
  const masterIdentity = await prisma.productUniqueIdentity.findUnique({
    where: {
      storeId_shopifyVariantId: {
        storeId: masterStoreId,
        shopifyVariantId: masterVariantId
      }
    }
  });

  if (!masterIdentity) {
    throw new Error(`Sync Aborted: Master store variant ${masterVariantId} is missing a Product Unique ID.`);
  }

  // Upsert the target identity using the MASTER's uniqueId
  const targetIdentity = await prisma.productUniqueIdentity.upsert({
    where: {
      storeId_shopifyVariantId: {
        storeId: targetStoreId,
        shopifyVariantId: targetVariantId
      }
    },
    update: {
      uniqueId: masterIdentity.uniqueId,
      shopifyProductId: targetProductId,
      isArchived: false
    },
    create: {
      uniqueId: masterIdentity.uniqueId,
      storeId: targetStoreId,
      shopifyProductId: targetProductId,
      shopifyVariantId: targetVariantId,
      isArchived: false
    }
  });

  return targetIdentity;
}

/**
 * [Product Delete Flow]
 * Soft deletes the identity by marking it archived.
 */
export async function archiveProductIdentity(
  storeId: string,
  shopifyProductId: string
) {
  const result = await prisma.productUniqueIdentity.updateMany({
    where: {
      storeId,
      shopifyProductId
    },
    data: { isArchived: true }
  });

  return result.count > 0;
}
