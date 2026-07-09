// ============================================================
// Centralized GraphQL Client
// ============================================================
// Reusable helper for executing Shopify GraphQL operations
// with consistent error handling and logging.

import { getAdminClient } from '@/lib/shopify/admin';
import { GraphqlQueryError } from '@shopify/shopify-api';
import { prisma } from '@/lib/db/prisma';

export interface GraphQLResponse<T = any> {
  data: T;
  extensions?: any;
}

/**
 * Executes a Shopify Admin GraphQL query or mutation.
 *
 * @param shopDomain - The store's myshopify domain
 * @param query - The GraphQL query/mutation string
 * @param variables - Optional variables for the query
 * @returns The parsed response data
 */
export async function executeGraphQL<T = any>(
  shopDomain: string,
  query: string,
  variables?: Record<string, any>
): Promise<GraphQLResponse<T>> {
  const client = await getAdminClient(shopDomain);

  try {
    const options: any = {};
    if (variables) {
      options.variables = variables;
    }

    const response = await client.request(query, options);
    return response as GraphQLResponse<T>;
  } catch (error: any) {
    // Handle Shopify-specific GraphQL errors
    if (error instanceof GraphqlQueryError) {
      console.error(
        `[GraphQLClient] Query error for ${shopDomain}:`,
        JSON.stringify(error.response, null, 2)
      );
      throw new Error(`Shopify GraphQL Error: ${error.message}`);
    }

    // Handle 401 Unauthorized — mark store as inactive
    if (
      error.response?.code === 401 ||
      error.response?.status === 401 ||
      error.statusCode === 401
    ) {
      console.warn(
        `[GraphQLClient] Access token invalid for ${shopDomain}. Marking store as inactive.`
      );
      await prisma.store.update({
        where: { shopDomain },
        data: { isActive: false },
      });
      throw new Error(`Unauthorized: Store ${shopDomain} marked as inactive.`);
    }

    // Re-throw unknown errors
    throw error;
  }
}
