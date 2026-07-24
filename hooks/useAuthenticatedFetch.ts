import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticatedFetch } from "@shopify/app-bridge/utilities";

export function useAuthenticatedFetch() {
  const app = useAppBridge();
  return authenticatedFetch(app);
}
