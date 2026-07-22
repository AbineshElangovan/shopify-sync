"use client";
import React, { useState, useEffect } from 'react';
import { Layout, BlockStack, Box, TextField, Button } from '@shopify/polaris';

export default function SkuSettingsPage() {
  const [skuPrefix, setSkuPrefix] = useState('SKU');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/settings/sku');
      const data = await res.json();
      if (data.success && data.setting) {
        setSkuPrefix(data.setting.skuPrefix);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setToastMessage(null);
    try {
      const res = await fetch('/api/settings/sku', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skuPrefix })
      });
      const data = await res.json();
      
      if (data.success) {
        setSkuPrefix(data.setting.skuPrefix);
        setToastMessage({ message: 'SKU Prefix saved successfully!', type: 'success' });
      } else {
        setToastMessage({ message: data.error || 'Failed to save', type: 'error' });
      }
    } catch (err: any) {
      setToastMessage({ message: err.message, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-8 max-w-2xl mx-auto mt-10">Loading SKU Settings...</div>;
  }

  return (
    <div className="p-8 max-w-2xl mx-auto mb-16">
      <h1 className="text-3xl font-bold mb-8 text-gray-900">SKU Generation Settings</h1>

      <Layout>
        <Layout.Section>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <BlockStack gap="400">
              <div>
                <h2 className="text-xl font-semibold mb-2">Configure SKU Prefix</h2>
                <p className="text-gray-600 mb-4 text-sm">
                  This prefix will be used when automatically generating SKUs for products synced to destination stores. 
                  For example, if your prefix is <strong>{skuPrefix || "SKU"}</strong>, the system will generate <strong>{skuPrefix || "SKU"}-000001</strong>.
                </p>
              </div>

              <Box maxWidth="300px">
                <TextField
                  label="SKU Prefix"
                  value={skuPrefix}
                  onChange={setSkuPrefix}
                  autoComplete="off"
                  helpText="Only uppercase letters and numbers are recommended."
                />
              </Box>

              <div className="mt-4 border-t pt-4 border-gray-100 flex justify-end">
                <Button variant="primary" onClick={handleSave} loading={saving}>
                  Save Settings
                </Button>
              </div>
            </BlockStack>
          </div>
        </Layout.Section>
      </Layout>

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
            animation: 'syncToastSlideIn 0.3s ease-out',
          }}
        >
          <style>{`
            @keyframes syncToastSlideIn {
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
            }}
          >✕</button>
        </div>
      )}
    </div>
  );
}
