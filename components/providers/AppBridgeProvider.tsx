"use client";

import { AppProvider } from "@shopify/polaris";
import { Provider as AppBridgeProvider } from "@shopify/app-bridge-react";

export default function ShopifyProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppBridgeProvider
      config={{


        apiKey: process.env.NEXT_PUBLIC_SHOPIFY_API_KEY!,
        host: "",
        forceRedirect: true,
      }}
    >
      <AppProvider i18n={{}}>
        {children}
      </AppProvider>
    </AppBridgeProvider>
  );
}