const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // First, get any active store
  const store = await prisma.store.findFirst();
  if (!store) {
    console.log("No store found to create product identity for.");
    return;
  }

  const { getOrCreateProductIdentity } = require('./services/product-identity.ts');

  // Simulate a product creation
  const mockProductId = "1111111111";
  const mockVariantId = "2222222222";

  console.log("Simulating Product Creation...");
  const identity = await getOrCreateProductIdentity(store.id, mockProductId, mockVariantId);
  
  console.log("Success! Generated Identity:");
  console.log(JSON.stringify(identity, null, 2));
}

main().catch(e => console.error(e)).finally(() => prisma.$disconnect());
