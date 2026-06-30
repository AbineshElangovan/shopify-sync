import "@shopify/shopify-api/adapters/web-api";
import { webApiAdapterInitialized } from "@shopify/shopify-api/adapters/web-api";
import { shopifyApi, ApiVersion } from "@shopify/shopify-api";
import { sessionStorage } from "./session-storage";

// This ensures the adapter import is not tree-shaken
console.log(`Shopify Web API Adapter Initialized: ${webApiAdapterInitialized}`);
export const shopify = shopifyApi({
  apiKey: process.env.SHOPIFY_API_KEY!,
  apiSecretKey: process.env.SHOPIFY_API_SECRET!,
  scopes: process.env.SHOPIFY_SCOPES!.split(","),
  hostName: process.env.SHOPIFY_APP_URL!.replace(/^https?:\/\//, ""),
  apiVersion: ApiVersion.July26,
  isEmbeddedApp: true,
  sessionStorage,
});