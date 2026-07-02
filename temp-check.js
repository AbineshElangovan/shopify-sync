const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  const stores = await prisma.store.findMany();
  console.log('STORES');
  console.log(JSON.stringify(stores, null, 2));
  const products = await prisma.productCache.findMany({ take: 10 });
  console.log('PRODUCTS');
  console.log(JSON.stringify(products, null, 2));
  await prisma.$disconnect();
})().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
