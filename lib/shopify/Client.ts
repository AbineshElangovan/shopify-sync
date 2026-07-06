"use client";

import { getSessionToken } from "@shopify/app-bridge/utilities/session-token";

export async function shopifyFetch(input: RequestInfo, init: RequestInit = {}) {
  // Wait for App Bridge (v3 or v4) to be initialized (up to 2 seconds)
  const maxRetries = 40;
  let retries = 0;
  
  while (
    typeof window !== "undefined" &&
    !(window as any).shopifyApp &&
    !((window as any).shopify && typeof (window as any).shopify.idToken === "function") &&
    retries < maxRetries
  ) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    retries++;
  }

  const app = typeof window !== "undefined" ? (window as any).shopifyApp : null;
  const shopifyV4 = typeof window !== "undefined" ? (window as any).shopify : null;
  
  let token: string;

  if (shopifyV4 && typeof shopifyV4.idToken === "function") {
    token = await shopifyV4.idToken();
  } else if (app) {
    token = await getSessionToken(app);
  } else {
    throw new Error("App Bridge not initialized");
  }

  return fetch(input, {
    ...init,
    headers: {
      ...(init.headers || {}),
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
}