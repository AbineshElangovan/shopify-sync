import { prisma } from './lib/db/prisma';

async function main() {
  console.log("Looking for collection named 'SHOCKS' or 'shocks'...");
  
  const collections = await prisma.collection.findMany({
    where: {
      title: {
        in: ['SHOCKS', 'shocks', 'Shocks']
      }
    }
  });

  if (collections.length === 0) {
    console.log("No collections found with that name.");
  }

  for (const col of collections) {
    console.log(`Renaming collection ID ${col.id} from ${col.title} to SOCKS`);
    await prisma.collection.update({
      where: { id: col.id },
      data: { title: 'SOCKS' }
    });
  }

  console.log("Done updating collection names in local database!");
}

main().catch(console.error);
