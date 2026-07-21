import { prisma } from './lib/db/prisma';

async function main() {
  console.log("Creating dummy store for testing...");
  
  const dummyStore = await prisma.store.upsert({
    where: { shopDomain: 'test-store-mock.myshopify.com' },
    update: {},
    create: {
      shopDomain: 'test-store-mock.myshopify.com',
      accessToken: 'shpua_dummy_token',
      label: 'Dummy Test Store',
      uniqueStoreId: 'ESHAN-MOCK999',
      isActive: true,
      isMaster: false,
      scope: 'write_products'
    }
  });

  console.log(`Successfully created dummy store:`);
  console.log(`- Domain: ${dummyStore.shopDomain}`);
  console.log(`- Unique ID: ${dummyStore.uniqueStoreId}`);
  console.log(`\nYou can now go to the Sync dashboard and enter: ${dummyStore.uniqueStoreId} to test the connection flow.`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
