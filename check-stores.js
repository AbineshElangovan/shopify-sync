const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const stores = await prisma.store.findMany({ select: { shopDomain: true, isMaster: true } });
  console.log(stores);
}
main().finally(() => prisma.$disconnect());
