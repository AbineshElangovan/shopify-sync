import { fetchLatestShopifyProduct } from './services/shopify/product-fetcher';

async function main() {
  const shop = 'eshan-inventory-solutions.myshopify.com';
  const { prisma } = require('./lib/db/prisma');
  
  const product = await prisma.productCache.findFirst({
    where: { store: { shopDomain: shop } }
  });

  if (!product) {
    console.log("No product found in DB.");
    return;
  }
  
  console.log(`Fetching latest for product: ${product.shopifyProductId}`);
  const payload = await fetchLatestShopifyProduct(shop, product.shopifyProductId);
  console.log("--- PAYLOAD ---");
  console.dir(payload, { depth: null });
}

main().catch(console.error);
