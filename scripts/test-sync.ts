import { processInventoryUpdate } from '../services/shopify';
import { prisma } from '../lib/db/prisma';

async function test() {
  console.log("Starting real-time sync simulation...");
  
  const shop = 'eshan-inventory-solutions.myshopify.com';
  const inventoryItemId = '51174448660699';
  const locationId = 'gid://shopify/Location/84568309951'; // From target
  
  // We want to trigger a sync update for quantity 15
  await processInventoryUpdate(
    shop,
    inventoryItemId,
    locationId,
    15,
    'test-webhook-id-' + Date.now()
  );
  
  console.log("Simulation command executed. Checking database for latest sync log...");
  
  const latestLog = await prisma.syncLog.findFirst({
    orderBy: { createdAt: 'desc' },
    include: {
      sourceStore: true,
      destinationStore: true
    }
  });
  
  if (latestLog) {
    console.log("RESULT:");
    console.log(`SKU: ${latestLog.sku}`);
    console.log(`From: ${latestLog.sourceStore.shopDomain} -> To: ${latestLog.destinationStore.shopDomain}`);
    console.log(`Status: ${latestLog.status}`);
    console.log(`Prev Qty: ${latestLog.previousQuantity} -> New Qty: ${latestLog.updatedQuantity}`);
    console.log(`Failure Reason: ${latestLog.failureReason}`);
  } else {
    console.log("No logs found in DB.");
  }
  
  await prisma.$disconnect();
}

test().catch(console.error);
