import { prisma } from './lib/db/prisma';
import { getAdminClient } from './lib/shopify/admin';

async function main() {
  const shop = 'eshan-coimbatore-store-8jjdfk4t.myshopify.com';
  const productId = 'gid://shopify/Product/8510688362687';
  
  try {
    const client = await getAdminClient(shop);
    const response: any = await client.request(
      `mutation { productDelete(input: { id: "${productId}" }) { deletedProductId userErrors { message } } }`
    );
    console.log(response);

    await prisma.collectionProduct.deleteMany({
      where: { productCache: { shopifyProductId: productId, store: { shopDomain: shop } } }
    });
    
    await prisma.productCache.deleteMany({
      where: { shopifyProductId: productId, store: { shopDomain: shop } }
    });

    await prisma.variantMap.deleteMany({
      where: { shopifyProductId: productId, store: { shopDomain: shop } }
    });
    
    console.log('Cleanup local DB completed for ghost product.');
  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}
main();
