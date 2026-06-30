"use client";

export async function shopifyFetch(input: RequestInfo, init: RequestInit = {}) {
  if (typeof window === "undefined" || !window.shopify) {
    throw new Error("App Bridge not initialized");
  }

  const token = await window.shopify.idToken();

  return fetch(input, {
    ...init,
    headers: {
      ...(init.headers || {}),
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
}