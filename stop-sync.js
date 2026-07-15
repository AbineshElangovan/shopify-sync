const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const result = await prisma.store.updateMany({
    data: { autoSyncEnabled: false }
  });
  console.log(`Successfully disabled auto-sync for ${result.count} stores.`);
}

main().finally(() => prisma.$disconnect());
