require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { createAdminApiClient } = require('@shopify/admin-api-client');
const prisma = new PrismaClient();

async function testGraphQL() {
  const store = await prisma.store.findFirst({ where: { isMaster: true } });
  if (!store) {
    console.log("No master store");
    return;
  }

  const client = createAdminApiClient({
    storeDomain: store.shopDomain,
    apiVersion: '2024-01',
    accessToken: store.accessToken,
  });

  try {
    const { data, errors } = await client.request(`
      query getCollections {
        collections(first: 10) {
          edges {
            node {
              id
              title
            }
          }
        }
      }
    `);
    console.log(JSON.stringify(data, null, 2));
    if (errors) console.log(errors);
  } catch (err) {
    console.log("Error:", err);
  }
}

testGraphQL();
