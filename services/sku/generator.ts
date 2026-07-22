import { prisma } from "@/lib/db/prisma";

/**
 * Retrieves the store's SKU configuration and generates the next SKU.
 * If the store has no setting configured, it defaults to prefix "SKU".
 * 
 * @param storeId The unique ID of the store in the database
 * @returns The formatted SKU string (e.g. "ESH-000001")
 */
export async function generateNextSku(storeId: string): Promise<string> {
  // Ensure a setting exists for the store
  const setting = await prisma.storeSetting.upsert({
    where: { storeId },
    update: {},
    create: {
      storeId,
      skuPrefix: "SKU",
      skuSequence: 1,
    }
  });

  // The current sequence is what we will use
  const currentSequence = setting.skuSequence;

  // Immediately increment the sequence for the next call
  await prisma.storeSetting.update({
    where: { storeId },
    data: { skuSequence: { increment: 1 } }
  });

  // Format the SKU: PREFIX-000001
  // Pad with leading zeros to 6 digits
  const paddedSequence = currentSequence.toString().padStart(6, '0');
  return `${setting.skuPrefix}-${paddedSequence}`;
}

export async function generateSkusForProductIfNeeded(shopDomain: string, payload: any) {
  const store = await prisma.store.findUnique({ where: { shopDomain } });
  if (!store) return payload;

  const variants = payload.variants || [];
  let updated = false;

  for (const variant of variants) {
    if (!variant.sku || variant.sku.trim() === '') {
      variant.sku = await generateNextSku(store.id);
      updated = true;
    }
  }

  return payload;
}
