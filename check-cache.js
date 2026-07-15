const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log("=== CACHE STATE ===");
  const caches = await prisma.productCache.findMany({
    orderBy: { updatedAt: 'desc' },
    take: 10,
    include: { store: true }
  });
  for (const c of caches) {
    console.log(`${c.sku} | ${c.store.shopDomain} | Qty: ${c.inventoryQuantity} | Updated: ${c.updatedAt}`);
  }
}

main().finally(() => prisma.$disconnect());
