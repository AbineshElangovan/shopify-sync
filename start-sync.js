const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const result = await prisma.store.updateMany({
    data: { autoSyncEnabled: true }
  });
  console.log(`Successfully enabled auto-sync for ${result.count} stores.`);
}

main().finally(() => prisma.$disconnect());
