const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const identities = await prisma.productUniqueIdentity.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5
  });
  console.log("RECENT IDENTITIES:\n" + JSON.stringify(identities, null, 2));
}

main().catch(e => {
  console.error(e);
}).finally(async () => {
  await prisma.$disconnect();
});
