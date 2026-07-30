const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkCollections() {
  const store = await prisma.store.findFirst({ where: { isMaster: true } });
  if (!store) {
    console.log("No master store");
    return;
  }
  const collections = await prisma.collection.findMany({
    where: { storeId: store.id }
  });
  console.log(`Collections for master store (${store.shopDomain}): ${collections.length}`);
  
  const allCols = await prisma.collection.findMany();
  console.log(`Total collections in DB: ${allCols.length}`);
}

checkCollections();
