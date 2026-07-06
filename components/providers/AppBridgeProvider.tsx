"use client";

import { useEffect, useState } from "react";
import { AppProvider } from "@shopify/polaris";
import { Provider as AppBridgeProvider, useAppBridge } from "@shopify/app-bridge-react";
import '@shopify/polaris/build/esm/styles.css';

function AppBridgeTracker() {
  const app = useAppBridge();
  useEffect(() => {
    if (typeof window !== "undefined") {
      (window as any).shopifyApp = app;
    }
  }, [app]);
  return null;
}

export default function ShopifyProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [host, setHost] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const urlParams = new URLSearchParams(window.location.search);
    const hostParam = urlParams.get("host");
    if (hostParam) {
      setHost(hostParam);
    }
    
    // Client-side diagnostic storage logging
    if (typeof window !== "undefined") {
      console.log("DIAG_COOKIES:", document.cookie);
      console.log("DIAG_LOCALSTORAGE:", JSON.stringify(localStorage));
      console.log("DIAG_SESSIONSTORAGE:", JSON.stringify(sessionStorage));
    }
  }, []);

  const polarisProvider = (
    <AppProvider i18n={{}}>
      {children}
    </AppProvider>
  );

  if (!mounted) {
    return polarisProvider; // default server render without AppBridge
  }

  if (!host) {
    return polarisProvider; // not in shopify admin
  }

  return (
    <AppBridgeProvider
      config={{
        apiKey: process.env.NEXT_PUBLIC_SHOPIFY_API_KEY || "",
        host: host,
        forceRedirect: true,
      }}
    >
      <AppBridgeTracker />
      {polarisProvider}
    </AppBridgeProvider>
  );
}