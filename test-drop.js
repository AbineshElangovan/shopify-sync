const { PrismaClient } = require('@prisma/client');
const { getAdminClient } = require('./lib/shopify/admin');
const { setInventoryQuantity } = require('./lib/shopify/inventory');

const prisma = new PrismaClient();

async function main() {
  const shopDomain = 'eshan-coimbatore-store-8jjdfk4t.myshopify.com';
  
  // Get variant map for TKT-GRY-001
  const variantMap = await prisma.variantMap.findFirst({
    where: { sku: 'TKT-GRY-001', store: { shopDomain } }
  });

  if (!variantMap) {
    console.log("Variant map not found");
    return;
  }

  console.log("Simulating an inventory drop of -1 for TKT-GRY-001...");
  
  // 1. Get current true inventory at location
  const client = await getAdminClient(shopDomain);
  const response = await client.request(
    `query getInventoryItem($id: ID!) {
      inventoryItem(id: $id) {
        inventoryLevels(first: 5) {
          edges {
            node {
              quantities(names: ["available"]) {
                quantity
              }
              location {
                id
              }
            }
          }
        }
      }
    }`,
    { variables: { id: variantMap.inventoryItemId } }
  );

  let currentLocationQuantity = 0;
  const levels = response.data?.inventoryItem?.inventoryLevels?.edges || [];
  for (const edge of levels) {
    if (edge.node.location.id === variantMap.locationId) {
      currentLocationQuantity = edge.node.quantities[0]?.quantity || 0;
    }
  }

  // 2. Drop it by 1
  const targetQuantity = currentLocationQuantity - 1;
  console.log(`Current: ${currentLocationQuantity}, Setting to: ${targetQuantity}`);

  await setInventoryQuantity(shopDomain, variantMap.inventoryItemId, variantMap.locationId, targetQuantity);
  console.log("Inventory dropped! Shopify should fire the webhooks now.");
}

main().finally(() => prisma.$disconnect());
