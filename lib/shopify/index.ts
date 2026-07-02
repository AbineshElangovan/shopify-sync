import "@shopify/shopify-api/adapters/web-api";
import { webApiAdapterInitialized } from "@shopify/shopify-api/adapters/web-api";
import { shopifyApi, ApiVersion, DeliveryMethod } from "@shopify/shopify-api";
import { sessionStorage } from "./session-storage";

import fs from "fs";
import path from "path";

// Extract hostName from shopify.app.toml or active config file as the single source of truth
function getAppHostName(): string {
  try {
    const rootDir = process.cwd();
    const files = fs.readdirSync(rootDir);
    // Find customized configs like shopify.app.eshan-chennai-store.toml
    const activeToml = files.find(f => f.startsWith("shopify.app.") && f.endsWith(".toml") && f !== "shopify.app.toml") || "shopify.app.toml";
    const tomlPath = path.join(rootDir, activeToml);
    if (fs.existsSync(tomlPath)) {
      const content = fs.readFileSync(tomlPath, "utf8");
      const match = content.match(/application_url\s*=\s*"([^"]+)"/);
      if (match && match[1]) {
        return match[1].replace(/^https?:\/\//, "");
      }
    }
  } catch (error) {
    console.error("Error reading shopify.app config:", error);
  }
  return (process.env.SHOPIFY_APP_URL || "").replace(/^https?:\/\//, "");
}

// This ensures the adapter import is not tree-shaken
console.log(`Shopify Web API Adapter Initialized: ${webApiAdapterInitialized}`);
export const shopify = shopifyApi({
  apiKey: process.env.SHOPIFY_API_KEY!,
  apiSecretKey: process.env.SHOPIFY_API_SECRET!,
  scopes: process.env.SHOPIFY_SCOPES!.split(","),
  hostName: getAppHostName(),
  apiVersion: ApiVersion.July26,
  isEmbeddedApp: true,
  sessionStorage,
});

shopify.webhooks.addHandlers({
  INVENTORY_LEVELS_UPDATE: {
    deliveryMethod: DeliveryMethod.Http,
    callbackUrl: "/api/webhooks/inventory-levels-update",
  },
  PRODUCTS_UPDATE: {
    deliveryMethod: DeliveryMethod.Http,
    callbackUrl: "/api/webhooks/products-update",
  },
  APP_UNINSTALLED: {
    deliveryMethod: DeliveryMethod.Http,
    callbackUrl: "/api/webhooks/app-uninstalled",
  },
});