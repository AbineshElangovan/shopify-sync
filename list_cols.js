const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const collections = await prisma.collection.findMany({
    where: { store: { isMaster: true } },
    select: { id: true, shopifyCollectionId: true, title: true }
  });
  console.log(collections);
}
run();
