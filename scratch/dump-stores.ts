import { prisma } from '../lib/db/prisma';

async function list() {
  const stores = await prisma.store.findMany();
  console.log("Stores:");
  console.log(JSON.stringify(stores, null, 2));

  const caches = await prisma.productCache.groupBy({
    by: ['storeId'],
    _count: true
  });
  console.log("Caches:");
  console.log(JSON.stringify(caches, null, 2));

  await prisma.$disconnect();
}

list().catch(console.error);
