"use client";

import React, { useState, useEffect } from 'react';
import { Input } from '@/components/forms';
import { useRouter } from 'next/navigation';
import { shopifyFetch } from '@/lib/shopify/Client';
import CollectionPriceAdjustment from '@/components/stores/CollectionPriceAdjustment';
import { ThemedSection } from '@/components/ui/ThemedSection';
import { StoreRoleBadge } from '@/components/ui/StoreRoleBadge';
import { Loading } from '@/components/common';

export default function PriceAdjustmentPage() {
  const router = useRouter();
  const [stores, setStores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [storeAdjustments, setStoreAdjustments] = useState<{ [storeId: string]: string }>({});
  const [storeSaving, setStoreSaving] = useState<{ [storeId: string]: boolean }>({});
  const [storeSuccessText, setStoreSuccessText] = useState<{ [storeId: string]: string }>({});
  const [toastMessage, setToastMessage] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const loadData = React.useCallback(async () => {
    try {
      const storesRes = await shopifyFetch(`/api/stores?active=false&t=${Date.now()}`, { cache: 'no-store' });
      if (storesRes.ok) {
        const storesJson = await storesRes.json();
        const loadedStores = storesJson.stores || [];
        setStores(loadedStores);

        const initialAdjustments: { [storeId: string]: string } = {};

        loadedStores.forEach((store: any) => {
          let initialVal = '0';
          if (store.priceAdjustmentValue !== undefined && store.priceAdjustmentValue !== null) {
            initialVal = store.priceAdjustmentValue.toString();
          }
          initialAdjustments[store.id] = initialVal;
        });
        setStoreAdjustments(initialAdjustments);
      }
    } catch (err) {
      console.error("Error loading stores data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();

    const handleFocus = () => loadData();
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        loadData();
      }
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  // Automatically hide any toast message after 3 seconds
  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => {
        setToastMessage(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  const handleStoreAdjustmentChange = (storeId: string, val: string) => {
    const numericValue = val.replace(/[^0-9]/g, '');
    
    setStoreAdjustments(prev => ({
      ...prev,
      [storeId]: numericValue
    }));
  };

  const handleStoreSave = async (storeId: string) => {
    const valStr = storeAdjustments[storeId];
    const val = parseFloat(valStr || '0');
    if (isNaN(val)) {
      setStoreSuccessText(prev => ({ ...prev, [storeId]: '✕ Invalid percentage value.' }));
      setToastMessage({ message: '❌ Failed to update price adjustment. Please try again.', type: 'error' });
      setTimeout(() => {
        setStoreSuccessText(prev => ({ ...prev, [storeId]: '' }));
        setToastMessage(prev => prev?.message === '❌ Failed to update price adjustment. Please try again.' ? null : prev);
      }, 3000);
      return;
    }

    setStoreSaving(prev => ({ ...prev, [storeId]: true }));
    try {
      const res = await shopifyFetch('/api/stores', {
        method: 'PUT',
        body: JSON.stringify({
          stores: [{
            id: storeId,
            priceAdjustmentValue: val,
            priceAdjustmentType: 'PERCENTAGE',
            isPriceAdjustmentEnabled: val !== 0,
          }]
        })
      });

      if (res.ok) {
        setStoreSuccessText(prev => ({ ...prev, [storeId]: '✓ Price adjustment updated successfully.' }));
        setToastMessage({ message: '✅ Price adjustment updated successfully.', type: 'success' });
        setTimeout(() => {
          setStoreSuccessText(prev => ({ ...prev, [storeId]: '' }));
          setToastMessage(prev => prev?.message === '✅ Price adjustment updated successfully.' ? null : prev);
        }, 3000);

        // Fetch fresh data from the server so the entire UI updates synchronously 
        await loadData();
      } else {
        setStoreSuccessText(prev => ({ ...prev, [storeId]: '✕ Failed to update price adjustment.' }));
        setToastMessage({ message: '❌ Failed to update price adjustment. Please try again.', type: 'error' });
        setTimeout(() => {
          setStoreSuccessText(prev => ({ ...prev, [storeId]: '' }));
          setToastMessage(prev => prev?.message === '❌ Failed to update price adjustment. Please try again.' ? null : prev);
        }, 3000);
      }
    } catch (err) {
      setStoreSuccessText(prev => ({ ...prev, [storeId]: '✕ Failed to update price adjustment.' }));
      setToastMessage({ message: '❌ Failed to update price adjustment. Please try again.', type: 'error' });
      setTimeout(() => {
        setStoreSuccessText(prev => ({ ...prev, [storeId]: '' }));
        setToastMessage(prev => prev?.message === '❌ Failed to update price adjustment. Please try again.' ? null : prev);
      }, 3000);
    } finally {
      setStoreSaving(prev => ({ ...prev, [storeId]: false }));
    }
  };

  if (loading) {
    return <Loading label="Loading adjustments..." />;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="flex flex-col gap-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827', margin: 0 }}>
              Price Adjustment
            </h1>
            <p style={{ marginTop: 4, color: '#6b7280', fontSize: '0.875rem' }}>
              Configure store-specific and collection-based pricing rules for synchronized products.
            </p>
          </div>
          <div>
            <StoreRoleBadge />
          </div>
        </div>

        <div className="flex flex-col gap-6">
            {stores.length === 0 ? (
              <p style={{ color: '#9ca3af', fontSize: '13px' }}>No stores available to configure.</p>
            ) : (
              stores.map((s, index) => {
                // Alternate between 3 distinct colors, avoiding Yellow!
                const themes = [
                  { bg: '#ecfdf5', border: '#a7f3d0', stripe: '#10b981', title: '#065f46', desc: '#047857' }, // Emerald (Green)
                  { bg: '#f0f9ff', border: '#bae6fd', stripe: '#0ea5e9', title: '#0369a1', desc: '#075985' }, // Sky (Blue)
                  { bg: '#eef2ff', border: '#c7d2fe', stripe: '#6366f1', title: '#3730a3', desc: '#312e81' }, // Indigo (Purple)
                ];
                const t = themes[index % themes.length];

                return (
                  <ThemedSection
                    key={s.id}
                    title={`${s.label || s.shopDomain} Adjustments`}
                    description={`Manage both global and collection-specific price adjustments for ${s.shopDomain}`}
                    bgColor={t.bg}
                    borderColor={t.border}
                    stripeColor={t.stripe}
                    titleColor={t.title}
                    descColor={t.desc}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                      
                      {/* Top Row: Global Store Adjustment */}
                      <div style={{ padding: '24px', backgroundColor: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
                          <div>
                            <span style={{ fontWeight: 700, fontSize: '15px', color: '#111827' }}>
                              Global Store Adjustment
                            </span>
                            <div style={{ color: '#6b7280', fontSize: '13px', marginTop: '4px' }}>
                              Applies to all products in this store
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', backgroundColor: '#f9fafb', padding: '12px 16px', borderRadius: '8px', border: '1px solid #f3f4f6' }}>
                            {storeSuccessText[s.id] && (
                              <span style={{
                                color: storeSuccessText[s.id].startsWith('✓') ? '#16a34a' : '#dc2626',
                                fontSize: '13px',
                                fontWeight: 500,
                                marginRight: '8px'
                              }}>
                                {storeSuccessText[s.id]}
                              </span>
                            )}
                            <div style={{ width: '120px' }}>
                              <Input
                                type="text"
                                label="Percentage"
                                labelHidden
                                suffix="%"
                                value={storeAdjustments[s.id] !== undefined ? storeAdjustments[s.id] : '0'}
                                onChange={(val) => handleStoreAdjustmentChange(s.id, val)}
                                autoComplete="off"
                              />
                            </div>
                            <button
                              className="px-4 py-2 bg-[var(--color-primary-dark)] text-white text-sm font-bold rounded-lg hover:bg-[var(--color-primary)] transition-colors shadow-sm disabled:opacity-50"
                              disabled={storeSaving[s.id]}
                              onClick={() => handleStoreSave(s.id)}
                            >
                              {storeSaving[s.id] ? 'Saving...' : 'Set Global'}
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Bottom Row: Collection Adjustment */}
                      <div style={{ padding: '24px', backgroundColor: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                        <CollectionPriceAdjustment storeId={s.id} storeName={s.label || s.shopDomain} />
                      </div>

                    </div>
                  </ThemedSection>
                );
              })
            )}
          </div>
      </div>
      
      {toastMessage && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            zIndex: 9999,
            backgroundColor: toastMessage.type === 'success' ? '#16a34a' : '#dc2626',
            color: '#ffffff',
            padding: '12px 24px',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '14px',
            fontWeight: 500,
            animation: 'settingsToastSlideIn 0.3s ease-out',
            border: '1px solid rgba(255,255,255,0.2)',
          }}
        >
          <style>{`
            @keyframes settingsToastSlideIn {
              from { transform: translateY(100px); opacity: 0; }
              to { transform: translateY(0); opacity: 1; }
            }
          `}</style>
          <span>{toastMessage.message}</span>
          <button
            onClick={() => setToastMessage(null)}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#ffffff',
              cursor: 'pointer',
              marginLeft: '12px',
              fontSize: '14px',
              opacity: 0.8,
              lineHeight: 1
            }}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
