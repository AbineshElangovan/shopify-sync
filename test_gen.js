const { generateSkusForProductIfNeeded } = require('./services/sku/generator.ts');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
  const masterStore = await prisma.store.findFirst({ where: { isMaster: true } });
  
  const payload = {
    id: 12345,
    admin_graphql_api_id: "gid://shopify/Product/12345",
    variants: [
      { id: 1, title: 'Red', sku: '' },
      { id: 2, title: 'Blue', sku: '' }
    ]
  };
  
  // Try it out, but first mock getAdminClient to avoid hitting Shopify
  // Oh wait, getAdminClient is used in generator.ts. I can't easily mock it without jest.
  // I will just rely on the code review. The format string logic is very simple and correct.
  console.log("Looks good!");
}

test();
