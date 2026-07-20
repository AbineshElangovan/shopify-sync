import { getAdminClient } from './lib/shopify/admin';
import { prisma } from './lib/db/prisma';

const PRODUCT_CREATE_MUTATION = `
  mutation productCreate($input: ProductInput!) {
    productCreate(input: $input) {
      product {
        id
        title
        variants(first: 1) {
          edges {
            node {
              id
              inventoryItem { id }
            }
          }
        }
      }
      userErrors { message }
    }
  }
`;

const INVENTORY_ADJUST_MUTATION = `
  mutation inventoryAdjustQuantity($inventoryItemId: ID!, $locationId: ID!, $availableDelta: Int!) {
    inventoryAdjustQuantity(input: {
      inventoryItemId: $inventoryItemId,
      locationId: $locationId,
      availableDelta: $availableDelta
    }) {
      inventoryLevel { available }
      userErrors { message }
    }
  }
`;

async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const masterDomain = 'eshan-inventory-solutions.myshopify.com';
  console.log(`Starting bulk creation test on ${masterDomain}`);
  
  try {
    const client = await getAdminClient(masterDomain);
    
    // Get master location ID
    const locationResponse: any = await client.request(`
      query { locations(first: 1) { edges { node { id } } } }
    `);
    const locationId = locationResponse.data.locations.edges[0].node.id;

    for (let i = 1; i <= 3; i++) {
      console.log(`\n--- Creating Test Product ${i} ---`);
      
      const title = `Webhook Test Product ${i} - ${Date.now()}`;
      const tags = "inner, test-tag";
      
      const createResponse: any = await client.request(PRODUCT_CREATE_MUTATION, {
        variables: {
          input: {
            title,
            tags,
            variants: [{ price: (100 * i).toString() }]
          }
        }
      });
      
      const product = createResponse.data.productCreate.product;
      console.log(`Created product: ${product.title} (ID: ${product.id})`);
      
      const variant = product.variants.edges[0].node;
      const inventoryItemId = variant.inventoryItem.id;
      
      console.log(`Waiting 1 second before adjusting inventory to simulate rapid updates...`);
      await delay(1000);
      
      console.log(`Adjusting inventory for Product ${i}...`);
      await client.request(INVENTORY_ADJUST_MUTATION, {
        variables: {
          inventoryItemId,
          locationId,
          availableDelta: 15 * i
        }
      });
      console.log(`Added ${15 * i} stock to Product ${i}.`);
      
      console.log(`Waiting 2 seconds before creating next product...`);
      await delay(2000);
    }
    
    console.log("\nAll 3 products created and updated successfully in Shopify.");
    console.log("Webhooks are now processing in the background.");
    console.log("We will wait 15 seconds to let the synchronization finish...");
    
    await delay(15000);
    
    console.log("\n--- Verifying Results in Database ---");
    
    const recentProducts = await prisma.productCache.findMany({
      where: { title: { startsWith: 'Webhook Test Product' } },
      include: { 
        store: true,
        collections: { include: { collection: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
    
    console.log(`Found ${recentProducts.length} synced records for the test products:\n`);
    
    for (const p of recentProducts) {
      console.log(`- Store: ${p.store.shopDomain}`);
      console.log(`  Title: ${p.title}`);
      console.log(`  SKU: ${p.sku || 'MISSING'}`);
      console.log(`  Stock: ${p.inventoryQuantity}`);
      const collNames = p.collections.map(c => c.collection.title).join(', ');
      console.log(`  Collections: ${collNames || 'None (Uncategorized)'}`);
      console.log('---------------------------');
    }
    
  } catch (err) {
    console.error("Test failed:", err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
