import { prisma } from './lib/db/prisma';

async function main() {
  console.log("Clearing old Sync Logs...");
  await prisma.syncLog.deleteMany({});
  
  console.log("Generating 5 dummy Sync Logs...");

  // Find the master store and some connected stores
  // Find the user's main store so the logs actually show up on their dashboard
  const masterStore = await prisma.store.findFirst({
    where: { shopDomain: 'eshan-coimbatore-store-8jjdfk4t.myshopify.com' }
  }) || await prisma.store.findFirst();
  
  if (!masterStore) {
    console.error("No master store found!");
    return;
  }

  const dummyStores = await prisma.store.findMany({
    where: { shopDomain: { not: masterStore.shopDomain } }
  });

  if (dummyStores.length === 0) {
    console.error("No dummy target stores found!");
    return;
  }

  const skus = ['TSHIRT-RED-M', 'MUG-WHITE', 'HAT-BLUE', 'SHOE-9', 'HOODIE-BLK-L'];
  const statuses = ['SUCCESS', 'SUCCESS', 'SUCCESS', 'FAILED', 'PENDING'];

  for (let i = 0; i < 5; i++) {
    const targetStore = dummyStores[i % dummyStores.length];
    const sku = skus[i % skus.length];
    const status = statuses[Math.floor(Math.random() * statuses.length)];
    const prevQty = Math.floor(Math.random() * 50);
    const newQty = prevQty + Math.floor(Math.random() * 20) - 5;
    
    await prisma.syncLog.create({
      data: {
        sku,
        sourceStoreId: masterStore.id,
        destinationStoreId: targetStore.id,
        previousQuantity: prevQty,
        updatedQuantity: newQty < 0 ? 0 : newQty,
        status: status,
        failureReason: status === 'FAILED' ? 'Network timeout during GraphQL request' : null,
        triggerType: 'MANUAL',
        createdAt: new Date(Date.now() - Math.floor(Math.random() * 100000000))
      }
    });
  }

  console.log("Successfully inserted 5 dummy Sync Logs!");
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
