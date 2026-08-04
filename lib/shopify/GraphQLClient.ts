

import { shopify } from "@/lib/shopify";
import { prisma } from "@/lib/db/prisma";
import { Session } from "@shopify/shopify-api";

export class ShopifyGraphQLClient {
  private shopDomain: string;
  private accessToken?: string;
  private client: any = null;

  constructor(shopDomain: string, accessToken?: string) {
    this.shopDomain = shopDomain.trim().toLowerCase();
    this.accessToken = accessToken;
  }

  private async getClient() {
    if (this.client) return this.client;

    let token = this.accessToken;
    if (!token) {
      const store = await prisma.store.findUnique({
        where: { shopDomain: this.shopDomain },
      });
      console.log((store as any)?.shop); // Also printing store.shop as requested
      console.log(store?.shopDomain);
      console.log(store?.accessToken);
      if (!store || !store.isActive) {
        throw new Error(`Store ${this.shopDomain} is not active or not found in database.`);
      }
      token = store.accessToken;
    }

    const session = new Session({
      id: `offline_${this.shopDomain}`,
      shop: this.shopDomain,
      state: "offline",
      isOnline: false,
      accessToken: token,
    });

    this.client = new shopify.clients.Graphql({ session });
    return this.client;
  }

  async request<T>(query: string, variables?: Record<string, any>): Promise<T> {
    const client = await this.getClient();
    console.log("[Backend: GraphQLClient] Executing Query:", query.substring(0, 100).replace(/\s+/g, ' '));
    console.log("[Backend: GraphQLClient] Variables:", variables);
    console.log("[Backend: GraphQLClient] Using Token:", this.accessToken?.substring(0, 15) || "Unknown (Fetched via Prisma)");

    try {
      const response = await client.request(query, { variables });

      if (!response) {
        throw new Error("Empty response returned from Shopify GraphQL API.");
      }

      return response as T;
    } catch (error: any) {
      console.error(`[ShopifyGraphQLClient] Error executing query for ${this.shopDomain}:`, error);
      throw error;
    }
  }
}
