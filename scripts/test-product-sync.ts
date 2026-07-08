import { processProductCreate, processProductUpdate, processProductDelete } from '../services/product-sync';
import { prisma } from '../lib/db/prisma';

async function runTest() {
  console.log("Starting product sync webhook simulation...");

  const sourceShop = 'eshan-inventory-solutions.myshopify.com';
  
  // Create mock product create payload
  const mockCreatePayload = {
    id: 9999999999,
    title: "Test Sync Product " + Date.now(),
    body_html: "This is a product synced from Chenna / Coimbatore",
    vendor: "Test Vendor",
    product_type: "Apparel",
    status: "active",
    options: [{ name: "Size", values: ["S", "M"] }],
    variants: [
      {
        id: 8888888888,
        title: "S",
        sku: "TEST-SYNC-SKU-1",
        price: "19.99",
        option1: "S"
      },
      {
        id: 7777777777,
        title: "M",
        sku: "TEST-SYNC-SKU-2",
        price: "21.99",
        option1: "M"
      }
    ]
  };

  // Register mock source store product mapping in database first so update and delete can lookup mappings
  const sourceStore = await prisma.store.findFirst({ where: { shopDomain: sourceShop } });
  if (sourceStore) {
    // Delete existing test entries to prevent constraint errors
    await prisma.variantMap.deleteMany({
      where: {
        storeId: sourceStore.id,
        sku: { in: ["TEST-SYNC-SKU-1", "TEST-SYNC-SKU-2"] }
      }
    });
    await prisma.productCache.deleteMany({
      where: {
        storeId: sourceStore.id,
        sku: { in: ["TEST-SYNC-SKU-1", "TEST-SYNC-SKU-2"] }
      }
    });

    for (const v of mockCreatePayload.variants) {
      await prisma.productCache.create({
        data: {
          storeId: sourceStore.id,
          shopifyProductId: `gid://shopify/Product/${mockCreatePayload.id}`,
          shopifyVariantId: `gid://shopify/ProductVariant/${v.id}`,
          sku: v.sku,
          title: mockCreatePayload.title,
          inventoryQuantity: 10
        }
      });
      await prisma.variantMap.create({
        data: {
          storeId: sourceStore.id,
          sku: v.sku,
          shopifyProductId: `gid://shopify/Product/${mockCreatePayload.id}`,
          shopifyVariantId: `gid://shopify/ProductVariant/${v.id}`,
          inventoryItemId: `gid://shopify/InventoryItem/${v.id}`
        }
      });
    }
  }

  console.log(`\n--- Simulating Product Create ---`);
  await processProductCreate(sourceShop, mockCreatePayload, "mock-create-" + Date.now());

  console.log(`\n--- Simulating Product Update ---`);
  const mockUpdatePayload = {
    ...mockCreatePayload,
    title: mockCreatePayload.title + " (Updated)"
  };
  await processProductUpdate(sourceShop, mockUpdatePayload, "mock-update-" + Date.now());

  console.log(`\n--- Simulating Product Delete ---`);
  const mockDeletePayload = {
    id: mockCreatePayload.id
  };
  await processProductDelete(sourceShop, mockDeletePayload, "mock-delete-" + Date.now());

  console.log("\nReplication simulation finished. Check latest logs in database:");
  const latestLogs = await prisma.syncLog.findMany({
    take: 5,
    orderBy: { createdAt: 'desc' },
    include: {
      sourceStore: true,
      destinationStore: true
    }
  });

  latestLogs.forEach((log) => {
    console.log(`- Time: ${log.createdAt.toISOString()} | SKU: ${log.sku} | From: ${log.sourceStore.shopDomain} -> To: ${log.destinationStore.shopDomain} | Status: ${log.status} | Msg: ${log.failureReason}`);
  });

  await prisma.$disconnect();
}

runTest().catch(console.error);
