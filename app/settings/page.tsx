"use client";

import React, { useState, useEffect } from 'react';
import { Card, Table } from '@/components/common';
import { BlockStack, Layout, Button, ChoiceList, InlineStack } from '@shopify/polaris';
import { shopifyFetch } from '@/lib/shopify/Client';
import { Input, Checkbox } from '@/components/forms';

export default function SettingsPage() {
  const [stores, setStores] = useState<any[]>([]);
  const [threshold, setThreshold] = useState<string>('15');
  const [customThreshold, setCustomThreshold] = useState<string>('15');
  const [autoSync, setAutoSync] = useState<boolean>(true);
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        const storesRes = await shopifyFetch('/api/stores?active=false');
        if (storesRes.ok) {
          const storesJson = await storesRes.json();
          setStores(storesJson.stores || []);
        }

        const settingsRes = await shopifyFetch('/api/settings');
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
    }
    loadData();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaveSuccess(false);
    try {
      const finalThreshold = threshold === 'custom' 
        ? parseInt(customThreshold, 10) || 15 
        : parseInt(threshold, 10);

      const res = await shopifyFetch('/api/settings', {
        method: 'PUT',
        body: JSON.stringify({
          lowStockThreshold: finalThreshold,
          autoSyncEnabled: autoSync,
        }),
      });

      if (res.ok) {
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
        <style>{`@keyframes sync-spin{to{transform:rotate(360deg)}}.sync-ring{width:44px;height:44px;border-radius:50%;border:4px solid #e5e7eb;border-top-color:#6366f1;animation:sync-spin 0.75s linear infinite}`}</style>
        <div className="sync-ring" />
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
            </BlockStack>
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <BlockStack gap="500">
              <Card>
                <h2 className="text-lg font-bold mb-4">Store Configurations</h2>
                
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
                        Save Settings
                      </Button>
                      {saveSuccess && (
                        <span style={{ color: '#16a34a', fontSize: '13px', fontWeight: 500, alignSelf: 'center' }}>
                          ✓ Settings saved!
                        </span>
                      )}
                    </InlineStack>
                  </div>
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </div>
  );
}
