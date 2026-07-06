
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
  try {
    console.log('Testing Store upsert in local workspace...');
    const result = await prisma.store.upsert({
      where: { shopDomain: 'test-shop.myshopify.com' },
      update: {
        accessToken: 'shpua_testtoken123',
        scope: 'read_products',
        isActive: true,
        label: 'test-shop.myshopify.com',
      },
      create: {
        shopDomain: 'test-shop.myshopify.com',
        accessToken: 'shpua_testtoken123',
        scope: 'read_products',
        isActive: true,
        label: 'test-shop.myshopify.com',
      },
    });
    console.log('Upsert successful! Result:', result);

    const count = await prisma.store.count();
    console.log('Current store count:', count);

    // Clean up
    await prisma.store.delete({
      where: { shopDomain: 'test-shop.myshopify.com' },
    });
    console.log('Clean up successful!');
  } catch (err) {
    console.error('Error during upsert test:', err);
  } finally {
    await prisma.$disconnect();
  }
}

test();
