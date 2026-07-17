import { getAdminClient } from '@/lib/shopify/admin';
import { prisma } from '@/lib/db/prisma';
import { 
  GET_COLLECTIONS_BY_TITLE_QUERY, 
  CREATE_COLLECTION_MUTATION, 
  ADD_PRODUCT_TO_COLLECTION_MUTATION,
  REMOVE_PRODUCT_FROM_COLLECTION_MUTATION,
  GET_PRODUCT_COLLECTIONS_QUERY
} from './graphql/collection';

const TAG_TO_COLLECTION_MAP: Record<string, string> = {
  'Inner': 'INNERS',
  'Pants': 'PANTS',
  'Shirts': 'SHIRTS',
  'T-Shirt': 'T-SHIRTS',
  'Accessories': 'MENS ACCESSORIES',
  'Shoes': 'SHOES',
  'Socks': 'SOCKS',
  'Trousers': 'TROUSERS',
};

export async function syncProductCollectionsByTags(targetShopDomain: string, productId: string, tagsString?: string) {
  try {
    if (!productId) return;
    const client = await getAdminClient(targetShopDomain);
    const targetStore = await prisma.store.findUnique({ where: { shopDomain: targetShopDomain } });
    if (!targetStore) return;

    const dbProduct = await prisma.productCache.findFirst({
      where: { storeId: targetStore.id, shopifyProductId: productId }
    });
    
    // Parse tags and determine desired collections
    const tags = tagsString ? tagsString.split(',').map(t => t.trim()).filter(Boolean) : [];
    const desiredCollections = new Set<string>();
    for (const tag of tags) {
      if (TAG_TO_COLLECTION_MAP[tag]) {
        desiredCollections.add(TAG_TO_COLLECTION_MAP[tag]);
      }
    }

    // Fetch existing collections for the product
    const productResponse: any = await client.request(GET_PRODUCT_COLLECTIONS_QUERY, {
      variables: { id: productId }
    });
    
    const existingEdges = productResponse?.data?.product?.collections?.edges || [];
    const currentCollections = new Map<string, string>(); // name -> id
    
    for (const edge of existingEdges) {
      if (edge.node) {
        currentCollections.set(edge.node.title, edge.node.id);
      }
    }

    // Identify which mapped collections to remove and which to add
    // Note: We only remove from collections that are PART of our mapping but not desired.
    // We shouldn't remove the product from unrelated collections.
    const mappedCollectionNames = Object.values(TAG_TO_COLLECTION_MAP);
    
    const toRemove: string[] = []; // Collection IDs
    for (const [title, id] of currentCollections.entries()) {
      if (mappedCollectionNames.includes(title) && !desiredCollections.has(title)) {
        toRemove.push(id);
      }
    }

    const toAdd: string[] = []; // Collection Names
    for (const desired of desiredCollections) {
      if (!currentCollections.has(desired)) {
        toAdd.push(desired);
      }
    }

    // Perform removals
    for (const collectionId of toRemove) {
      console.log(`[CollectionSync] Removing product ${productId} from collection ${collectionId} in ${targetShopDomain}`);
      await client.request(REMOVE_PRODUCT_FROM_COLLECTION_MUTATION, {
        variables: { id: collectionId, productIds: [productId] }
      });

      if (dbProduct) {
        const dbCol = await prisma.collection.findFirst({
          where: { storeId: targetStore.id, shopifyCollectionId: collectionId }
        });
        if (dbCol) {
          await prisma.collectionProduct.deleteMany({
            where: { collectionId: dbCol.id, productCacheId: dbProduct.id }
          });
        }
      }
    }

    // Perform additions (and creations if needed)
    for (const title of toAdd) {
      let collectionId: string | null = null;
      let collectionHandle = '';
      
      // Check if collection exists
      const searchResponse: any = await client.request(GET_COLLECTIONS_BY_TITLE_QUERY, {
        variables: { query: `title:"${title}"`, first: 1 }
      });
      
      const searchEdges = searchResponse?.data?.collections?.edges || [];
      if (searchEdges.length > 0 && searchEdges[0].node.title === title) {
        collectionId = searchEdges[0].node.id;
        collectionHandle = searchEdges[0].node.handle;
      }

      // Create if missing
      if (!collectionId) {
        console.log(`[CollectionSync] Creating missing collection "${title}" in ${targetShopDomain}`);
        const createResponse: any = await client.request(CREATE_COLLECTION_MUTATION, {
          variables: { input: { title } }
        });
        const userErrors = createResponse?.data?.collectionCreate?.userErrors || [];
        if (userErrors.length > 0) {
          console.error(`[CollectionSync] Error creating collection "${title}":`, userErrors);
          continue;
        }
        collectionId = createResponse?.data?.collectionCreate?.collection?.id;
        collectionHandle = createResponse?.data?.collectionCreate?.collection?.handle || title.toLowerCase().replace(/\s+/g, '-');
      }

      if (collectionId) {
        console.log(`[CollectionSync] Adding product ${productId} to collection ${collectionId} ("${title}") in ${targetShopDomain}`);
        await client.request(ADD_PRODUCT_TO_COLLECTION_MUTATION, {
          variables: { id: collectionId, productIds: [productId] }
        });

        if (dbProduct) {
          try {
            const dbCol = await prisma.collection.upsert({
              where: { storeId_shopifyCollectionId: { storeId: targetStore.id, shopifyCollectionId: collectionId } },
              update: { title, handle: collectionHandle },
              create: { storeId: targetStore.id, shopifyCollectionId: collectionId, title, handle: collectionHandle }
            });

            await prisma.collectionProduct.upsert({
              where: { collectionId_productCacheId: { collectionId: dbCol.id, productCacheId: dbProduct.id } },
              update: {},
              create: { collectionId: dbCol.id, productCacheId: dbProduct.id }
            });
          } catch (dbErr: any) {
            console.error(`[CollectionSync] Failed to update local DB for collection ${collectionId}:`, dbErr.message);
          }
        }
      }
    }
  } catch (error) {
    console.error(`[CollectionSync] Fatal error syncing collections for ${productId} in ${targetShopDomain}:`, error);
  }
}
