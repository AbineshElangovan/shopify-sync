"use client";

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { shopifyFetch } from '@/lib/shopify/Client';

export interface StoreInfo {
  id: string;
  shopDomain: string;
  label: string | null;
  masterLabel: string | null;
  isMaster: boolean;
  isActive: boolean;
  scope: string;
  productCount?: number;
  variantCount?: number;
  syncCount?: number;
  isStandalone?: boolean;
}

interface StoreContextValue {
  activeStores: StoreInfo[];
  currentStore: StoreInfo | null;
  storeCount: number;
  isStandalone: boolean;
  isMultiStore: boolean;
  isMaster: boolean;
  canManageCatalog: boolean;
  canManageSku: boolean;
  canManagePricing: boolean;
  canManageNetwork: boolean;
  canSyncToConnectedStores: boolean;
  loading: boolean;
}

const StoreContext = createContext<StoreContextValue>({
  activeStores: [],
  currentStore: null,
  storeCount: 0,
  isStandalone: false,
  isMultiStore: false,
  isMaster: false,
  canManageCatalog: false,
  canManageSku: false,
  canManagePricing: false,
  canManageNetwork: false,
  canSyncToConnectedStores: false,
  loading: true,
});

export const useStoreContext = () => useContext(StoreContext);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [activeStores, setActiveStores] = useState<StoreInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const searchParams = useSearchParams();
  const currentShopDomain = searchParams.get('shop');

  useEffect(() => {
    async function loadStores() {
      try {
        const res = await shopifyFetch('/api/stores');
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.stores) {
            // Only consider genuinely active stores for the count
            const active = data.stores.filter((s: StoreInfo) => s.isActive);
            setActiveStores(active);
          }
        }
      } catch (err) {
        console.error("Error fetching stores for StoreProvider", err);
      } finally {
        setLoading(false);
      }
    }
    loadStores();
  }, []);

  const currentStore = activeStores.find(s => s.shopDomain === currentShopDomain) || 
                       (activeStores.length > 0 ? activeStores[0] : null);
  
  const storeCount = activeStores.length;
  
  const isMaster = currentStore?.isMaster || false;
  // A store is standalone if it's explicitly marked via the API (no connections and not a master of another network)
  const isStandalone = currentStore?.isStandalone === true;
  const isMultiStore = !isStandalone;

  // Capability Model
  const canManageCatalog = isMaster || isStandalone;
  const canManageSku = isMaster || isStandalone;
  const canManagePricing = isMaster || isStandalone;
  
  // Network operations remain strictly Master-only
  const canManageNetwork = isMaster;
  const canSyncToConnectedStores = isMaster;

  return (
    <StoreContext.Provider value={{
      activeStores,
      currentStore,
      storeCount,
      isStandalone,
      isMultiStore,
      isMaster,
      canManageCatalog,
      canManageSku,
      canManagePricing,
      canManageNetwork,
      canSyncToConnectedStores,
      loading
    }}>
      {children}
    </StoreContext.Provider>
  );
}
