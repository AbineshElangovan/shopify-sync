import { prisma } from './lib/db/prisma';

async function main() {
  console.log("Creating 5 dummy stores...");
  
  // Find a source store to connect them to
  const sourceStore = await prisma.store.findFirst();
  if (!sourceStore) {
    console.error("No source store found to connect to!");
    return;
  }

  const dummyStores = [
    { domain: 'chennai.myshopify.com', uniqueId: 'ESHAN-CHE001', label: 'Chennai Store' },
    { domain: 'madurai.myshopify.com', uniqueId: 'ESHAN-MAD002', label: 'Madurai Store' },
    { domain: 'bangalore.myshopify.com', uniqueId: 'ESHAN-BLR003', label: 'Bangalore Store' },
    { domain: 'kochi.myshopify.com', uniqueId: 'ESHAN-KOC004', label: 'Kochi Store' },
    { domain: 'mumbai.myshopify.com', uniqueId: 'ESHAN-MUM005', label: 'Mumbai Store' },
  ];

  for (const dummy of dummyStores) {
    const store = await prisma.store.upsert({
      where: { shopDomain: dummy.domain },
      update: {} as any,
      create: {
        shopDomain: dummy.domain,
        accessToken: 'shpua_dummy_token',
        label: dummy.label,
        uniqueStoreId: dummy.uniqueId,
        isActive: true,
        isMaster: false,
        scope: 'write_products'
      } as any
    });

    console.log(`Created dummy store: ${store.label} (${(store as any).uniqueStoreId})`);

    // Automatically connect to the source store
    // @ts-ignore
    await (prisma as any).storeConnection.upsert({
      where: {
        sourceStoreId_targetStoreId: {
          sourceStoreId: sourceStore.id,
          targetStoreId: store.id
        }
      } as any,
      update: {} as any,
      create: {
        sourceStoreId: sourceStore.id,
        targetStoreId: store.id
      } as any
    });
  }

  console.log(`\nSuccessfully created and connected 5 dummy stores to ${sourceStore.label || sourceStore.shopDomain}!`);
  console.log(`Refresh your dashboard to see them in the Connected Stores table.`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
