import { prisma } from './lib/db/prisma';
import { getAdminClient } from './lib/shopify/admin';

async function main() {
  const store = await prisma.store.findFirst();
  if (!store) return;
  const client = await getAdminClient(store.shopDomain);
  const query = `
    query {
      __type(name: "InventoryItemInput") {
        inputFields {
          name
          type {
            name
          }
        }
      }
    }
  `;
  const res: any = await client.request(query);
  console.log(JSON.stringify(res.data.__type.inputFields, null, 2));
}

main().catch(console.error);
