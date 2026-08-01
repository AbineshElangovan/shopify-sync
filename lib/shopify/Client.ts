"use client";

import { getSessionToken } from "@shopify/app-bridge/utilities/session-token";

export async function shopifyFetch(input: RequestInfo, init: RequestInit = {}) {

  const maxRetries = 20; // Fast fail if it's taking too long
  let retries = 0;
  let delay = 100;

  const hasHost = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("host");

  while (
    hasHost &&
    typeof window !== "undefined" &&
    !(window as any).shopifyApp &&
    !((window as any).shopify && typeof (window as any).shopify.idToken === "function") &&
    retries < maxRetries
  ) {
    await new Promise((resolve) => setTimeout(resolve, delay));
    retries++;
  }

  const app = typeof window !== "undefined" ? (window as any).shopifyApp : null;
  const shopifyV4 = typeof window !== "undefined" ? (window as any).shopify : null;

  let token: string;

  if (shopifyV4 && typeof shopifyV4.idToken === "function") {
    try {
      token = await shopifyV4.idToken();
    } catch (err: any) {
      if (process.env.NODE_ENV === "development" && err?.message?.includes("host did not respond")) {
        console.warn("[shopifyFetch] idToken unavailable (host did not respond). Falling back to dev_fallback_token.");
        token = "dev_fallback_token";
      } else {
        console.warn("[shopifyFetch] App Bridge idToken failed:", err.message);
        throw err;
      }
    }
  } else if (app) {
    token = await getSessionToken(app);
  } else if (process.env.NODE_ENV === "development") {
    console.warn("[shopifyFetch] App Bridge not initialized in dev mode. Falling back to dev_fallback_token.");
    token = "dev_fallback_token";
  } else {
    throw new Error("App Bridge not initialized");
  }


  let requestInput = input;
  if (typeof window !== "undefined" && window.location) {
    const windowParams = new URLSearchParams(window.location.search);
    const shop = windowParams.get("shop");
    if (shop && typeof requestInput === "string" && requestInput.startsWith("/")) {
      const targetUrl = new URL(requestInput, window.location.origin);
      if (!targetUrl.searchParams.has("shop")) {
        targetUrl.searchParams.set("shop", shop);
        requestInput = targetUrl.pathname + targetUrl.search;
      }
    }
  }

  return fetch(requestInput, {
    ...init,
    headers: {
      ...(init.headers || {}),
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
}