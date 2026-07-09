import { prisma } from '../lib/db/prisma';

async function check() {
  const caches = await prisma.productCache.findMany({
    where: { sku: 'TKT-GRY-001' },
    include: {
      store: true
    }
  });

  console.log("Current cached levels for SKU TKT-GRY-001:");
  caches.forEach((c) => {
    console.log(`- Store: ${c.store.shopDomain} | Qty: ${c.inventoryQuantity} | VariantID: ${c.shopifyVariantId}`);
  });

  const maps = await prisma.variantMap.findMany({
    where: { sku: 'TKT-GRY-001' }
  });
  console.log("Maps count:", maps.length);
  maps.forEach(m => {
     console.log(`- StoreID: ${m.storeId} | VariantID: ${m.shopifyVariantId} | InvItemId: ${m.inventoryItemId} | LocId: ${m.locationId}`);
  });

  await prisma.$disconnect();
}

check().catch(console.error);
