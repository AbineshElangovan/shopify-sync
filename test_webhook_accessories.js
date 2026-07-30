const { generateSkusForProductIfNeeded } = require('./services/sku/generator.ts');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
  const store = await prisma.store.findFirst({ where: { isMaster: true } });
  
  // Find a product mapping to get a valid product ID
  const prod = await prisma.productCache.findFirst({ where: { storeId: store.id } });
  
  if (!prod) {
    console.log("No product found in DB");
    return;
  }
  
  console.log("Testing with product:", prod.title, prod.shopifyProductId);
  
  const payload = {
    id: prod.shopifyProductId.replace('gid://shopify/Product/', ''),
    admin_graphql_api_id: prod.shopifyProductId,
    variants: [
      {
        id: prod.shopifyVariantId.replace('gid://shopify/ProductVariant/', ''),
        admin_graphql_api_id: prod.shopifyVariantId,
        title: "Default Title",
        sku: "TEST-SKU"
      }
    ]
  };
  
  await generateSkusForProductIfNeeded(store.shopDomain, payload);
}

test();
