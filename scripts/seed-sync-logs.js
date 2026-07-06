const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function seed() {
  try {
    console.log('Seeding mock sync logs...');

    // 1. Get the source store (active store)
    const sourceStore = await prisma.store.findFirst({
      where: {
        shopDomain: 'eshan-inventory-solutions.myshopify.com',
      },
    });

    if (!sourceStore) {
      console.error('❌ Source store eshan-inventory-solutions.myshopify.com not found. Please install the app first.');
      return;
    }

    // 2. Upsert a mock target store that won't be deleted by cleanupSeededData
    // We set isActive to false so that Next.js doesn't try to sync its products live with Shopify.
    const targetStore = await prisma.store.upsert({
      where: { shopDomain: 'eshan-chennai-outlet.myshopify.com' },
      update: {
        label: 'ESHAN Chennai Outlet',
        accessToken: 'shpua_dummytargetstoretokenvalue123',
        scope: 'write_products,write_inventory',
        isActive: false,
      },
      create: {
        shopDomain: 'eshan-chennai-outlet.myshopify.com',
        label: 'ESHAN Chennai Outlet',
        accessToken: 'shpua_dummytargetstoretokenvalue123',
        scope: 'write_products,write_inventory',
        isActive: false,
      },
    });

    // 3. Clear existing logs first
    await prisma.syncLog.deleteMany({
      where: {
        OR: [
          { sourceStoreId: sourceStore.id },
          { destinationStoreId: targetStore.id },
        ],
      },
    });

    // 4. Create mock logs
    const mockLogs = [
      {
        sku: 'ES-TSHIRT-L',
        previousQuantity: 15,
        updatedQuantity: 12,
        status: 'SUCCESS',
      },
      {
        sku: 'ES-JEANS-32',
        previousQuantity: 3,
        updatedQuantity: 5,
        status: 'SUCCESS',
      },
      {
        sku: 'ES-SHOES-10',
        previousQuantity: 10,
        updatedQuantity: 8,
        status: 'FAILED',
        failureReason: 'Location ID not mapped on target store.',
      },
      {
        sku: 'ES-JACKET-M',
        previousQuantity: 20,
        updatedQuantity: 15,
        status: 'SUCCESS',
      },
      {
        sku: 'ES-CAP-RED',
        previousQuantity: 0,
        updatedQuantity: 2,
        status: 'SUCCESS',
      },
    ];

    for (const logData of mockLogs) {
      await prisma.syncLog.create({
        data: {
          sku: logData.sku,
          sourceStoreId: sourceStore.id,
          destinationStoreId: targetStore.id,
          previousQuantity: logData.previousQuantity,
          updatedQuantity: logData.updatedQuantity,
          status: logData.status,
          failureReason: logData.failureReason,
        },
      });
    }

    console.log('✅ Successfully seeded 5 mock sync logs!');
  } catch (error) {
    console.error('❌ Error seeding sync logs:', error);
  } finally {
    await prisma.$disconnect();
  }
}

seed();
