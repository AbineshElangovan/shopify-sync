import { shopify } from "@/lib/shopify";
import { prisma } from "@/lib/db/prisma";
import { Session, GraphqlQueryError } from "@shopify/shopify-api";

export async function getAdminClient(shopDomain: string) {
  console.log("[AdminClient] Initializing getAdminClient for shop:", shopDomain);
  const store = await prisma.store.findUnique({
    where: { shopDomain },
  });

  console.log("[AdminClient] Store record query result:", {
    found: Boolean(store),
    isActive: store?.isActive,
    hasAccessToken: Boolean(store?.accessToken),
  });

  if (!store || !store.isActive) {
    throw new Error(`Store ${shopDomain} is not active or not found.`);
  }

  const maskedToken = store.accessToken
    ? `${store.accessToken.substring(0, 10)}...${store.accessToken.substring(store.accessToken.length - 4)}`
    : "null";
  console.log("[AdminClient] Instantiating offline Session with token:", maskedToken);

  const session = new Session({
    id: `offline_${shopDomain}`,
    shop: shopDomain,
    state: "offline",
    isOnline: false,
    accessToken: store.accessToken,
  });

  const client = new shopify.clients.Graphql({ session });
  console.log("[AdminClient] GraphQL client initialized successfully.");
  return client;
}

async function handleGraphQLError(error: any, shopDomain: string) {
  if (error instanceof GraphqlQueryError) {
    console.error(`GraphQL Query Error for ${shopDomain}:`, JSON.stringify(error.response, null, 2));
    throw new Error(`Shopify GraphQL Error: ${error.message}`);
  }

 
  if (error.response?.code === 401 || error.response?.status === 401 || error.statusCode === 401) {
    console.warn(`Access token invalid for ${shopDomain}. Marking store as inactive.`);
    await prisma.store.update({
      where: { shopDomain },
      data: { isActive: false },
    });
    throw new Error(`Unauthorized: Store ${shopDomain} marked as inactive.`);
  }

  throw error;
}

export async function fetchShopInfo(shopDomain: string) {
  const client = await getAdminClient(shopDomain);

  try {
    const response = await client.request(`
      query {
        shop {
          id
          name
          email
          myshopifyDomain
        }
      }
    `);
    
    return response.data?.shop;
  } catch (error) {
    return handleGraphQLError(error, shopDomain);
  }
}

export async function fetchProducts(shopDomain: string, first = 10) {
  const client = await getAdminClient(shopDomain);

  try {
    const response = await client.request(`
      query getProducts($first: Int!) {
        products(first: $first) {
          edges {
            node {
              id
              title
              handle
              updatedAt
              variants(first: 5) {
                edges {
                  node {
                    id
                    title
                    sku
                    price
                  }
                }
              }
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    `, { variables: { first } });

    return response.data?.products;
  } catch (error) {
    return handleGraphQLError(error, shopDomain);
  }
}

export async function fetchProductVariants(shopDomain: string, productId: string, first = 50) {
  const client = await getAdminClient(shopDomain);

  try {
    const response = await client.request(`
      query getVariants($id: ID!, $first: Int!) {
        product(id: $id) {
          variants(first: $first) {
            edges {
              node {
                id
                title
                sku
                inventoryItem {
                  id
                }
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      }
    `, { variables: { id: productId, first } });

    return response.data?.product?.variants;
  } catch (error) {
    return handleGraphQLError(error, shopDomain);
  }
}

export async function fetchInventoryLevels(shopDomain: string, inventoryItemId: string) {
  const client = await getAdminClient(shopDomain);

  try {
    const response = await client.request(`
      query getInventory($id: ID!) {
        inventoryItem(id: $id) {
          inventoryLevels(first: 10) {
            edges {
              node {
                id
                quantities(names: ["available"]) {
                  name
                  quantity
                }
                location {
                  id
                  name
                }
              }
            }
          }
        }
      }
    `, { variables: { id: inventoryItemId } });

    return response.data?.inventoryItem?.inventoryLevels;
  } catch (error) {
    return handleGraphQLError(error, shopDomain);
  }
}
