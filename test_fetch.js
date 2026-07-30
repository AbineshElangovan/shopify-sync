const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const masterStore = await prisma.store.findFirst({ where: { isMaster: true } });
  
  console.log("Fetching Price Adjustments...");
  try {
    const res1 = await fetch(`http://localhost:3000/api/stores/${masterStore.id}/collection-adjustments?t=` + Date.now());
    console.log("Status 1:", res1.status);
    const text1 = await res1.text();
    console.log("Resp 1 length:", text1.length);
  } catch(e) { console.log(e.message); }

  console.log("Fetching SKU Rules...");
  try {
    const res2 = await fetch(`http://localhost:3000/api/stores/${masterStore.id}/collection-sku-rules?t=` + Date.now());
    console.log("Status 2:", res2.status);
    const text2 = await res2.text();
    console.log("Resp 2 length:", text2.length);
  } catch(e) { console.log(e.message); }
}

check();
