import { prisma } from './lib/db/prisma';
import { getAdminClient } from './lib/shopify/admin';
import { GET_PUBLICATIONS_QUERY, PUBLISH_MUTATION, GET_PRODUCTS_BASIC_QUERY } from './services/shopify/graphql';

async function main() {
  const storeDomain = 'eshan-inventory-solutions.myshopify.com';
  console.log(`\nStore: ${storeDomain}`);
  try {
    const client = await getAdminClient(storeDomain);
    
    // Check if we can get publications now
    const pubResponse: any = await client.request(GET_PUBLICATIONS_QUERY);
    const publications = pubResponse?.data?.publications?.edges || [];
    console.log(`Found ${publications.length} publications`);
    for (const edge of publications) {
      console.log(`- ${edge.node.name} (${edge.node.id})`);
    }

    if (publications.length === 0) {
      console.log('No publications found.');
      return;
    }

    const productsRes: any = await client.request(GET_PRODUCTS_BASIC_QUERY, { variables: { first: 1 } });
    const product = productsRes?.data?.products?.edges?.[0]?.node;
    if (product) {
      console.log(`Testing publish on Product: ${product.title} (${product.id})`);
      
      const publicationInputs = publications.map((edge: any) => ({
        publicationId: edge.node.id
      }));

      const response: any = await client.request(PUBLISH_MUTATION, {
        variables: {
          id: product.id,
          input: publicationInputs
        }
      });
      const userErrors = response?.data?.publishablePublish?.userErrors || [];
      if (userErrors.length > 0) {
        console.error(`Failed to publish:`, userErrors);
      } else {
        console.log(`Successfully published to ${publications.length} channels!`);
      }
    }
  } catch (e: any) {
    console.error(`Error:`, e.message);
  }
}

main().catch(console.error);
