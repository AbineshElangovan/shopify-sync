const { GET } = require('./app/api/stores/[storeId]/collection-sku-rules/route.ts');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testEndpoint() {
  const masterStore = await prisma.store.findFirst({ where: { isMaster: true } });
  
  const req = {
    method: 'GET',
    url: `http://localhost/api/stores/${masterStore.id}/collection-sku-rules`,
  };
  
  const params = { storeId: masterStore.id };
  
  const response = await GET(req, { params: Promise.resolve(params) });
  const data = await response.json();
  console.log(JSON.stringify(data, null, 2));
}

testEndpoint().catch(console.error);
