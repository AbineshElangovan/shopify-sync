"use client";

import React, { useState, useEffect } from 'react';
import { Input, Checkbox, Select } from '@/components/forms';
import { useRouter } from 'next/navigation';
import { shopifyFetch } from '@/lib/shopify/Client';
import CollectionPriceAdjustment from '@/components/stores/CollectionPriceAdjustment';
import { Button } from '@/components/common/Button';
import { ThemedSection } from '@/components/ui/ThemedSection';
import { LocalizedDate } from '@/components/common/LocalizedDate';
import { StoreRoleBadge } from '@/components/ui/StoreRoleBadge';
import { Loading } from '@/components/common';


export default function SettingsPage() {
  const router = useRouter();
  const [stores, setStores] = useState<any[]>([]);
  const [threshold, setThreshold] = useState<string>('15');
  const [customThreshold, setCustomThreshold] = useState<string>('15');
  const [debugOutput, setDebugOutput] = useState<string>('');
  const [autoSync, setAutoSync] = useState<boolean>(true);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [storeAdjustments, setStoreAdjustments] = useState<{ [storeId: string]: string }>({});
  const [storeSaving, setStoreSaving] = useState<{ [storeId: string]: boolean }>({});
  const [storeSuccessText, setStoreSuccessText] = useState<{ [storeId: string]: string }>({});
  const [toastMessage, setToastMessage] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const [masterLabels, setMasterLabels] = useState<{ [storeId: string]: string }>({});
  const [masterSaving, setMasterSaving] = useState(false);
  const [masterStoreId, setMasterStoreId] = useState<string | null>(null);

  const loadData = React.useCallback(async () => {
    try {
      const storesRes = await shopifyFetch(`/api/stores?active=false&t=${Date.now()}`, { cache: 'no-store' });
      if (storesRes.ok) {
        const storesJson = await storesRes.json();
        setDebugOutput(JSON.stringify(storesJson));
        const loadedStores = storesJson.stores || [];
        setStores(loadedStores);

        const currentSettings = storesJson.storeSettings || {};
        if (currentSettings.threshold) setThreshold(currentSettings.threshold.toString());
        const initialAdjustments: { [storeId: string]: string } = {};
        const initialMasterLabels: { [storeId: string]: string } = {};
        let initialMasterStoreId = null;

        loadedStores.forEach((store: any) => {
          let initialVal = '0';
          if (store.priceAdjustmentValue !== undefined && store.priceAdjustmentValue !== null) {
            initialVal = store.priceAdjustmentValue.toString();
          }
          initialAdjustments[store.id] = initialVal;
          initialMasterLabels[store.id] = store.masterLabel || '';
          if (store.isMaster) {
            initialMasterStoreId = store.id;
          }
        });
        setStoreAdjustments(initialAdjustments);
        setMasterLabels(initialMasterLabels);
        setMasterStoreId(initialMasterStoreId);
      } else {
        const errText = await storesRes.text();
        setDebugOutput(`API ERROR ${storesRes.status}: ${errText}`);
      }

      const settingsRes = await shopifyFetch(`/api/settings?t=${Date.now()}`, { cache: 'no-store' });
      if (settingsRes.ok) {
        const settingsJson = await settingsRes.json();
        const threshVal = settingsJson.settings.lowStockThreshold;
        setAutoSync(settingsJson.settings.autoSyncEnabled);

        if ([5, 10, 20].includes(threshVal)) {
          setThreshold(threshVal.toString());
        } else {
          setThreshold('custom');
          setCustomThreshold(threshVal.toString());
        }
      }
    } catch (err) {
      console.error("Error loading settings data:", err);
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
    let numericValue = val.replace(/[^0-9]/g, '');
    if (numericValue.length > 1 && numericValue.startsWith('0')) {
      numericValue = numericValue.replace(/^0+/, '');
    }
    if (numericValue === '') numericValue = '0';
    
    setStoreAdjustments(prev => ({
      ...prev,
      [storeId]: numericValue
    }));
  };

  const handleMasterLabelChange = (storeId: string, val: string) => {
    setMasterLabels(prev => ({ ...prev, [storeId]: val }));
  };

  const handleSetMaster = async (storeId: string, autoLabel: string, isAlreadyMaster: boolean = false) => {
    const confirmMsg = isAlreadyMaster ? "Are you sure you want to update the Master Label?" : "Are you sure you want to change the Master Store?";
    if (!window.confirm(confirmMsg)) return;

    setMasterSaving(true);
    try {
      const res = await shopifyFetch('/api/stores/master', {
        method: 'PUT',
        body: JSON.stringify({ storeId, masterLabel: autoLabel })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setToastMessage({ message: '✅ Master changed.', type: 'success' });
        setTimeout(() => {
          setToastMessage(prev => prev?.message === '✅ Master changed.' ? null : prev);
        }, 3000);
        await loadData();
        router.refresh();
      } else {
        setToastMessage({ message: `❌ Failed: ${data.error}`, type: 'error' });
        setTimeout(() => {
          setToastMessage(prev => prev?.message === `❌ Failed: ${data.error}` ? null : prev);
        }, 3000);
      }
    } catch (err: any) {
      setToastMessage({ message: '❌ Failed to change Master.', type: 'error' });
      setTimeout(() => {
        setToastMessage(prev => prev?.message === '❌ Failed to change Master.' ? null : prev);
      }, 3000);
    } finally {
      setMasterSaving(false);
    }
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

  const handleSave = async () => {
    setSaving(true);
    setSaveSuccess(false);
    try {
      const finalThreshold = threshold === 'custom'
        ? parseInt(customThreshold, 10) || 15
        : parseInt(threshold, 10);

      // Save threshold and autoSync settings
      const settingsRes = await shopifyFetch('/api/settings', {
        method: 'PUT',
        body: JSON.stringify({
          lowStockThreshold: finalThreshold,
          autoSyncEnabled: autoSync,
        }),
      });

      if (settingsRes.ok) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } catch (err) {
      console.error("Error saving settings:", err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <Loading label="Loading settings..." />;
  }

  const formattedStores = stores.map((s) => ({
    id: s.id,
    domain: s.shopDomain,
    label: s.label || s.shopDomain,
    status: s.isActive ? 'CONNECTED' : 'DISCONNECTED',
    installedAt: <LocalizedDate date={s.installedAt} format="date" />,
  }));

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="flex flex-col gap-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827', margin: 0 }}>
              Settings
            </h1>
            <p style={{ marginTop: '4px', color: '#6b7280', fontSize: '0.875rem' }}>
              Manage store connections, threshold alerts, and synchronization rules
            </p>
          </div>
          <div>
            <StoreRoleBadge />
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-8">
          <div className="flex-1 flex flex-col gap-6">


              <ThemedSection
                title="Master Store Configuration"
                description="Identify the primary store. Synchronization originates from the Master Store."
                bgColor="#fff1f2"
                borderColor="#fecdd3"
                stripeColor="#f43f5e"
                titleColor="#9f1239"
                descColor="#be123c"
              >

                <div className="flex flex-col gap-4">
                  {stores.length === 0 ? (
                    <div>
                      <p style={{ color: '#9ca3af', fontSize: '13px' }}>No stores available to configure.</p>
                      <pre className="text-xs text-red-500 mt-2 whitespace-pre-wrap">{debugOutput}</pre>
                    </div>
                  ) : (
                    stores.map((s) => (
                      <div
                        key={s.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '16px',
                          border: s.isMaster ? '2px solid #6366f1' : '1px solid #e5e7eb',
                          borderRadius: '10px',
                          backgroundColor: s.isMaster ? '#eef2ff' : '#f9fafb',
                          gap: '16px',
                          flexWrap: 'wrap'
                        }}
                      >
                        <div>
                          <span style={{ fontWeight: 600, fontSize: '14px', color: '#111827' }}>
                            {s.label || s.shopDomain}
                          </span>
                          <div style={{ color: '#6b7280', fontSize: '12px', marginTop: '2px' }}>
                            {s.shopDomain}
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                          {s.isMaster ? (
                            <span className="px-2.5 py-1 rounded-md text-[11px] font-bold bg-green-700 text-white uppercase tracking-wider border border-green-800 shadow-sm">
                              Master
                            </span>
                          ) : (
                            <button
                              className="px-3 py-1.5 bg-[var(--color-primary-dark)] text-white text-sm font-semibold rounded-lg hover:bg-[var(--color-primary)] transition-colors shadow-sm disabled:opacity-50"
                              disabled={masterSaving}
                              onClick={() => handleSetMaster(s.id, masterLabels[s.id] || (s.label || s.shopDomain).replace('.myshopify.com', ''), false)}
                            >
                              {masterSaving ? 'Saving...' : 'Make Master'}
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </ThemedSection>

              <ThemedSection
                title="Store-Specific Pricing Rules & Adjustments"
                description="Configure automatic markups or fixed price adjustments when replicating products to each target store."
                bgColor="#ecfdf5"
                borderColor="#a7f3d0"
                stripeColor="#10b981"
                titleColor="#065f46"
                descColor="#047857"
              >

                <div className="flex flex-col gap-4">
                  {stores.length === 0 ? (
                    <p style={{ color: '#9ca3af', fontSize: '13px' }}>No stores available to configure.</p>
                  ) : (
                    stores.map((s) => (
                      <div
                        key={s.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '16px',
                          border: '1px solid #e5e7eb',
                          borderRadius: '10px',
                          backgroundColor: '#f9fafb',
                          gap: '16px',
                          flexWrap: 'wrap'
                        }}
                      >
                        <div>
                          <span style={{ fontWeight: 600, fontSize: '14px', color: '#111827' }}>
                            {s.label || s.shopDomain}
                          </span>
                          <div style={{ color: '#6b7280', fontSize: '12px', marginTop: '2px' }}>
                            {s.shopDomain}
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
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
                          <span style={{ fontSize: '13px', color: '#4b5563', fontWeight: 500 }}>
                            Price Adjustment:
                          </span>
                          <div style={{ width: '120px' }}>
                            <Input
                              type="text"
                              label="Price Adjustment Percentage"
                              labelHidden
                              suffix="%"
                              value={storeAdjustments[s.id] !== undefined ? storeAdjustments[s.id] : '0'}
                              onChange={(val) => handleStoreAdjustmentChange(s.id, val)}
                              autoComplete="off"
                            />
                          </div>
                          <button
                            className="px-3 py-1.5 bg-[var(--color-primary-dark)] text-white text-sm font-semibold rounded-lg hover:bg-[var(--color-primary)] transition-colors shadow-sm disabled:opacity-50"
                            disabled={storeSaving[s.id]}
                            onClick={() => handleStoreSave(s.id)}
                          >
                            {storeSaving[s.id] ? 'Saving...' : 'Set'}
                          </button>
                        </div>
                        <div style={{ width: '100%' }}>
                          <CollectionPriceAdjustment storeId={s.id} storeName={s.label || s.shopDomain} />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </ThemedSection>

              <ThemedSection
                title="SKU Generation Settings"
                description="Configure automatic SKU generation and rules for new products."
                bgColor="#f0fdf4"
                borderColor="#bbf7d0"
                stripeColor="#22c55e"
                titleColor="#166534"
                descColor="#15803d"
              >
                <div style={{ padding: '8px 0' }}>
                  <button className="px-4 py-2 bg-[var(--color-primary-dark)] text-white text-sm font-semibold rounded-lg hover:bg-[var(--color-primary)] transition-colors shadow-sm" onClick={() => router.push(`/settings/sku${window.location.search}`)}>
                    Configure SKU Generation
                  </button>
                </div>
              </ThemedSection>
            </div>

          <div className="w-full lg:w-[360px] shrink-0 flex flex-col gap-6">
              <ThemedSection
                title="Store Configurations"
                bgColor="#fffbeb"
                borderColor="#fde68a"
                stripeColor="#f59e0b"
                titleColor="#b45309"
              >
                <div className="flex flex-col gap-4">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 mb-2">Low Stock Alert Threshold</h3>
                    <div className="flex flex-col gap-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" checked={threshold === '10'} onChange={() => setThreshold('10')} className="text-[var(--color-primary-dark)] focus:ring-[var(--color-primary-dark)]" />
                        <span className="text-sm text-gray-700">10 units</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" checked={threshold === '20'} onChange={() => setThreshold('20')} className="text-[var(--color-primary-dark)] focus:ring-[var(--color-primary-dark)]" />
                        <span className="text-sm text-gray-700">20 units</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" checked={threshold === 'custom'} onChange={() => setThreshold('custom')} className="text-[var(--color-primary-dark)] focus:ring-[var(--color-primary-dark)]" />
                        <span className="text-sm text-gray-700">Custom Value</span>
                      </label>
                    </div>
                  </div>

                  {threshold === 'custom' && (
                    <Input
                      type="number"
                      label="Custom Threshold Value"
                      labelHidden
                      value={customThreshold}
                      onChange={(val) => setCustomThreshold(val)}
                      autoComplete="off"
                    />
                  )}

                  <div style={{ marginTop: '8px' }}>
                    <div className="flex items-center justify-between">
                      <div className="flex gap-3">
                        <button className="px-4 py-2 bg-[var(--color-primary-dark)] text-white text-sm font-semibold rounded-lg hover:bg-[var(--color-primary)] transition-colors shadow-sm disabled:opacity-50" disabled={saving} onClick={handleSave}>
                          {saving ? 'Saving...' : 'Save'}
                        </button>
                      </div>
                      {saveSuccess && (
                        <span style={{ color: '#16a34a', fontSize: '13px', fontWeight: 500 }}>
                          ✓ Saved!
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </ThemedSection>
          </div>
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
