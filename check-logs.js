const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const logs = await prisma.syncLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5
  });
  console.log("=== RECENT SYNC LOGS ===");
  for (const log of logs) {
    const sourceStore = await prisma.store.findUnique({ where: { id: log.sourceStoreId } });
    const destStore = await prisma.store.findUnique({ where: { id: log.destinationStoreId } });
    console.log(`[${log.createdAt.toISOString()}] SKU: ${log.sku} | Source: ${sourceStore?.shopDomain} -> Dest: ${destStore?.shopDomain} | Prev: ${log.previousQuantity} -> New: ${log.updatedQuantity} | Status: ${log.status}`);
    if (log.failureReason) {
      console.log(`  Reason: ${log.failureReason}`);
    }
  }
}

main().finally(() => prisma.$disconnect());
