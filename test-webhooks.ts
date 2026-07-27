import { PrismaClient } from '@prisma/client';
import { getAdminClient } from './lib/shopify/admin';
const prisma = new PrismaClient();

async function main() {
  const store = await prisma.store.findFirst({ where: { label: 'ESHAN Coimbatore Store ' } });
  if (!store) return console.log('Store not found');
  
  const client = await getAdminClient(store.shopDomain);
  const response: any = await client.request(`
    query {
      webhookSubscriptions(first: 10) {
        edges {
          node {
            id
            topic
            endpoint {
              __typename
              ... on WebhookHttpEndpoint {
                callbackUrl
              }
            }
          }
        }
      }
    }
  `);
  
  console.log(JSON.stringify(response.data.webhookSubscriptions.edges, null, 2));
}

main().finally(() => prisma.$disconnect());
