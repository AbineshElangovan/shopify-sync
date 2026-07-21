import { prisma } from './lib/db/prisma';

async function main() {
  console.log("Deleting fake dummy stores...");

  const dummyDomains = [
    'test-store-mock.myshopify.com',
    'chennai-store-mock.myshopify.com',
    'madurai-store-mock.myshopify.com',
    'bangalore-store-mock.myshopify.com',
    'kochi-store-mock.myshopify.com'
  ];

  const stores = await prisma.store.findMany({
    where: { shopDomain: { in: dummyDomains } }
  });

  const storeIds = stores.map(s => s.id);

  // Delete dependent SyncLogs first
  await prisma.syncLog.deleteMany({
    where: {
      OR: [
        { sourceStoreId: { in: storeIds } },
        { destinationStoreId: { in: storeIds } }
      ]
    }
  });

  // Then delete the stores
  const result = await prisma.store.deleteMany({
    where: { id: { in: storeIds } }
  });

  console.log(`Successfully deleted ${result.count} fake dummy stores!`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
