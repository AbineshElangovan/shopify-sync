import { prisma } from "@/lib/db/prisma";
import { getAdminClient } from "@/lib/shopify/admin";

async function createTestProduct() {
  console.log("=== Creating Test Product on Shopify ===");
  try {
    const masterStore = await prisma.store.findFirst({
      where: { isMaster: true },
    });

    if (!masterStore) {
      console.error("❌ No master store found.");
      return;
    }

    console.log(`Using Master Store: ${masterStore.shopDomain}`);

    // We will use the REST API via the Shopify client to easily set inventory, sku, and tags
    const client = await getAdminClient(masterStore.shopDomain);
    
    // Using GraphQL to get the first location ID to set inventory
    const LOCATIONS_QUERY = `
      query {
        locations(first: 1) {
          edges {
            node {
              id
            }
          }
        }
      }
    `;
    const locRes: any = await client.request(LOCATIONS_QUERY);
    const locationId = locRes.data.locations.edges[0].node.id;

    console.log(`Location ID found: ${locationId}`);

    const productInput = {
      product: {
        title: "End-to-End Test Product",
        vendor: "TestVendor",
        product_type: "Clothing",
        tags: "T-Shirt, Automation Test",
        variants: [
          {
            price: "29.99",
            title: "Default Title"
          }
        ]
      }
    };

    console.log("Sending product creation request to Shopify (REST)...");
    const response: any = await client.request(
      `products.json`,
      {
        method: 'POST',
        data: productInput
      }
    );

    const createdProduct = response.data?.product;
    if (!createdProduct) {
      console.error("❌ Failed to create product", response.data);
      return;
    }

    const inventoryItemId = createdProduct.variants[0].inventory_item_id;
    console.log(`✅ Product created! ID: ${createdProduct.id}`);
    
    // Now set inventory
    const INVENTORY_ADJUST_MUTATION = `
      mutation inventoryAdjustQuantities($input: InventoryAdjustQuantitiesInput!) {
        inventoryAdjustQuantities(input: $input) {
          userErrors {
            field
            message
          }
          inventoryAdjustmentGroup {
            reason
          }
        }
      }
    `;
    
    console.log(`Setting inventory to 42 for inventory item: ${inventoryItemId}`);
    const invGid = `gid://shopify/InventoryItem/${inventoryItemId}`;
    await client.request(INVENTORY_ADJUST_MUTATION, {
      variables: {
        input: {
          reason: "correction",
          name: "available",
          changes: [
            {
              delta: 42,
              inventoryItemId: invGid,
              locationId: locationId
            }
          ]
        }
      }
    });
    
    console.log("✅ Inventory set successfully!");
    console.log("\nWaiting 15 seconds for webhooks to process...");
    
    // Wait for the webhook to be processed by Next.js
    await new Promise(resolve => setTimeout(resolve, 15000));
    
    console.log("\n=== Checking Database ===");
    
    const dbProduct = await prisma.productCache.findFirst({
      where: { shopifyProductId: `gid://shopify/Product/${createdProduct.id}` },
      include: {
        collections: {
          include: {
            collection: true
          }
        }
      }
    });
    
    if (dbProduct) {
      console.log(`✅ Found in ProductCache!`);
      console.log(`- Title: ${dbProduct.title}`);
      console.log(`- SKU: ${dbProduct.sku || 'EMPTY'}`);
      console.log(`- Inventory: ${dbProduct.inventoryQuantity}`);
      console.log(`- Collections: ${dbProduct.collections.map((c: any) => c.collection.title).join(', ') || 'NONE'}`);
    } else {
      console.log(`❌ Product NOT found in ProductCache!`);
    }

    const dbMap = await prisma.variantMap.findFirst({
      where: { shopifyProductId: `gid://shopify/Product/${createdProduct.id}` }
    });
    
    if (dbMap) {
      console.log(`✅ Found in VariantMap!`);
      console.log(`- SKU: ${dbMap.sku}`);
    } else {
      console.log(`❌ Variant NOT found in VariantMap!`);
    }

  } catch (error) {
    console.error("❌ Test script failed:", error);
  } finally {
    await prisma.$disconnect();
  }
}

createTestProduct();
