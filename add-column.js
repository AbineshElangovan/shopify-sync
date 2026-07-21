const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRawUnsafe(`ALTER TABLE stores ADD COLUMN "uniqueStoreId" TEXT;`);
  
  const stores = await prisma.store.findMany();
  for (const store of stores) {
    const randomId = 'STORE-' + Math.random().toString(36).substring(2, 10).toUpperCase();
    await prisma.$executeRawUnsafe(`UPDATE stores SET "uniqueStoreId" = '${randomId}' WHERE id = '${store.id}';`);
  }
  
  await prisma.$executeRawUnsafe(`ALTER TABLE stores ALTER COLUMN "uniqueStoreId" SET NOT NULL;`);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX "stores_uniqueStoreId_key" ON stores("uniqueStoreId");`);
  
  console.log("Database updated successfully");
}

main().catch(console.error).finally(() => prisma.$disconnect());
