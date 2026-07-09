import { prisma } from '../lib/db/prisma';

async function check() {
  const stores = await prisma.store.findMany({
    include: {
      _count: {
        select: {
          productCaches: true,
          variantMaps: true
        }
      }
    }
  });

  console.log("Connected Stores and cache stats:");
  stores.forEach((store) => {
    console.log(`- Shop: ${store.shopDomain} | Active: ${store.isActive} | Products: ${store._count.productCaches} | Variants: ${store._count.variantMaps}`);
  });

  await prisma.$disconnect();
}

check().catch(console.error);
