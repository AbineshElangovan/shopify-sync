"use client";

import React, { useState, useEffect } from 'react';
import { Card, Table } from '@/components/common';
import { BlockStack, Layout, Button, ChoiceList, InlineStack } from '@shopify/polaris';
import { shopifyFetch } from '@/lib/shopify/Client';
import { useRouter } from 'next/navigation';
import { Input, Checkbox, Select } from '@/components/forms';

const ThemedSection = ({
  title,
  description,
  bgColor,
  borderColor,
  stripeColor,
  titleColor,
  descColor,
  children
}: {
  title: string;
  description?: string;
  bgColor: string;
  borderColor: string;
  stripeColor: string;
  titleColor: string;
  descColor?: string;
  children: React.ReactNode;
}) => (
  <div style={{ backgroundColor: bgColor, border: `1px solid ${borderColor}`, borderRadius: '12px', padding: '24px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
    <div style={{ marginBottom: '20px', borderLeft: `4px solid ${stripeColor}`, paddingLeft: '12px' }}>
      <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: titleColor, margin: 0 }}>
        {title}
      </h2>
      {description && (
        <p style={{ marginTop: '4px', color: descColor, fontSize: '0.875rem' }}>
          {description}
        </p>
      )}
    </div>
    {children}
  </div>
);

export default function SettingsPage() {
  const router = useRouter();
  const [stores, setStores] = useState<any[]>([]);
  const [threshold, setThreshold] = useState<string>('15');
  const [customThreshold, setCustomThreshold] = useState<string>('15');
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
        const loadedStores = storesJson.stores || [];
        setStores(loadedStores);

        const initialAdjustments: { [storeId: string]: string } = {};
        const initialMasterLabels: { [storeId: string]: string } = {};
        let initialMasterStoreId = null;

        loadedStores.forEach((store: any) => {
          let initialVal = '0';
          if (store.priceAdjustmentValue !== undefined && store.priceAdjustmentValue !== null) {
            const sign = store.priceAdjustmentValue > 0 ? '+' : '';
            initialVal = `${sign}${store.priceAdjustmentValue}`;
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

  // Automatically hide any toast message after 15 seconds
  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => {
        setToastMessage(null);
      }, 15000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  const handleStoreAdjustmentChange = (storeId: string, val: string) => {
    setStoreAdjustments(prev => ({
      ...prev,
      [storeId]: val
    }));
  };

  const handleMasterLabelChange = (storeId: string, val: string) => {
    setMasterLabels(prev => ({ ...prev, [storeId]: val }));
  };

  const handleSetMaster = async (storeId: string, autoLabel: string) => {
    const confirmMsg = "Are you sure you want to change the Master Store?";
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
        }, 15000);
        await loadData();
        router.refresh();
      } else {
        setToastMessage({ message: `❌ Failed: ${data.error}`, type: 'error' });
        setTimeout(() => {
          setToastMessage(prev => prev?.message === `❌ Failed: ${data.error}` ? null : prev);
        }, 15000);
      }
    } catch (err: any) {
      setToastMessage({ message: '❌ Failed to change Master.', type: 'error' });
      setTimeout(() => {
        setToastMessage(prev => prev?.message === '❌ Failed to change Master.' ? null : prev);
      }, 15000);
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
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '50vh', gap: 14 }}>
        <style>{`@keyframes sync-spin{to{transform:rotate(360deg)}}.ys-sync-ring{width:44px;height:44px;border-radius:50%;border:4px solid #e5e7eb;border-top-color:#6366f1;animation:sync-spin 0.75s linear infinite}`}</style>
        <div className="ys-sync-ring" />
        <p style={{ margin: 0, fontSize: 13, color: '#9ca3af', fontWeight: 500 }}>Loading settings…</p>
      </div>
    );
  }

  const formattedStores = stores.map((s) => ({
    id: s.id,
    domain: s.shopDomain,
    label: s.label || s.shopDomain,
    status: s.isActive ? 'CONNECTED' : 'DISCONNECTED',
    installedAt: new Date(s.installedAt).toLocaleDateString(),
  }));

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <BlockStack gap="800">
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827', margin: 0 }}>
            Settings
          </h1>
          <p style={{ marginTop: '4px', color: '#6b7280', fontSize: '0.875rem' }}>
            Manage store connections, threshold alerts, and synchronization rules
          </p>
        </div>

        <Layout>
          <Layout.Section>
            <BlockStack gap="500">
              <Table
                title="Connected Store Channels"
                headerColor="#2563eb"
                columns={[
                  { title: 'Store Label', key: 'label', type: 'bold' },
                  { title: 'Shopify Domain', key: 'domain' },
                  { title: 'Installed On', key: 'installedAt' },
                  {
                    title: 'Connection State',
                    key: 'status',
                    type: 'status',
                    badgeRules: { CONNECTED: 'success', DISCONNECTED: 'critical' },
                  },
                ]}
                items={formattedStores}
                paginate={false}
                searchable={false}
                filterable={false}
                emptyState={
                  <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>
                    No connected store records found. Visit the Partner Dashboard to register this app.
                  </div>
                }
              />

              <ThemedSection
                title="Master Store Configuration"
                description="Identify the primary store. Synchronization originates from the Master Store."
                bgColor="#fff1f2"
                borderColor="#fecdd3"
                stripeColor="#f43f5e"
                titleColor="#9f1239"
                descColor="#be123c"
              >

                <BlockStack gap="400">
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
                          <span style={{ fontSize: '13px', fontWeight: s.isMaster ? 600 : 500, color: s.isMaster ? '#4338ca' : '#4b5563', marginRight: '16px' }}>
                            {s.isMaster ? '● Master Store' : '○ Connected Store'}
                          </span>

                          {!s.isMaster && (
                            <Button
                              variant="primary"
                              loading={masterSaving}
                              onClick={() => handleSetMaster(s.id, (s.label || s.shopDomain).replace('.myshopify.com', ''))}
                            >
                              Make Master
                            </Button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </BlockStack>
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

                <BlockStack gap="400">
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
                          <Button
                            variant="primary"
                            loading={storeSaving[s.id]}
                            onClick={() => handleStoreSave(s.id)}
                          >
                            Set
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </BlockStack>
              </ThemedSection>
            </BlockStack>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <BlockStack gap="500">
              <ThemedSection
                title="Store Configurations"
                bgColor="#fffbeb"
                borderColor="#fde68a"
                stripeColor="#f59e0b"
                titleColor="#b45309"
              >

                <BlockStack gap="400">
                  <Checkbox
                    label="Enable Real-Time Inventory Sync"
                    checked={autoSync}
                    onChange={(val) => setAutoSync(val)}
                  />

                  <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '16px' }}>
                    <ChoiceList
                      title="Low Stock Alert Threshold"
                      choices={[
                        { label: '10 units', value: '10' },
                        { label: '20 units', value: '20' },
                        { label: 'Custom Value', value: 'custom' },
                      ]}
                      selected={[threshold]}
                      onChange={(selected) => setThreshold(selected[0])}
                    />
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
                    <InlineStack gap="300" align="space-between">
                      <Button variant="primary" loading={saving} onClick={handleSave}>
                        Save
                      </Button>
                      {saveSuccess && (
                        <span style={{ color: '#16a34a', fontSize: '13px', fontWeight: 500, alignSelf: 'center' }}>
                          ✓ Settings Saved!
                        </span>
                      )}
                    </InlineStack>
                  </div>
                </BlockStack>
              </ThemedSection>
            </BlockStack>
          </Layout.Section>
        </Layout>
      </BlockStack>
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
