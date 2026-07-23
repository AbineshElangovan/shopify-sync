"use client";
import React, { useState, useEffect } from 'react';
import { Layout, BlockStack, Box, TextField, Button, Text } from '@shopify/polaris';

export default function SkuSettingsPage() {
  const [skuPrefix, setSkuPrefix] = useState('SHOE');
  const [skuSequence, setSkuSequence] = useState('0001');
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [inlineError, setInlineError] = useState<string | null>(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/settings/sku');
      const data = await res.json();
      if (data.success && data.setting) {
        setSkuPrefix(data.setting.skuPrefix || 'SHOE');
        
        // Ensure sequence displays nicely as 4 digits minimum
        const seq = data.setting.skuSequence || 1;
        setSkuSequence(seq.toString().padStart(4, '0'));
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
    setInlineError(null);
    
    try {
      const res = await fetch('/api/settings/sku', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skuPrefix, skuSequence })
      });
      const data = await res.json();
      
      if (data.success) {
        setSkuPrefix(data.setting.skuPrefix);
        setSkuSequence(data.setting.skuSequence.toString().padStart(4, '0'));
        setToastMessage({ message: '✅ SKU configuration saved successfully.', type: 'success' });
      } else {
        setToastMessage({ message: data.error || 'Failed to save configuration.', type: 'error' });
        
        // Handle specific validation errors for Prefix History Sequence mismatch
        if (data.nextSequence) {
           setInlineError(`⚠ Prefix "${skuPrefix}" already exists. Next available sequence: ${data.nextSequence}.`);
           setSkuSequence(data.nextSequence.toString().padStart(4, '0'));
        }
      }
    } catch (err: any) {
      setToastMessage({ message: err.message, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-8 max-w-2xl mx-auto mt-10">Loading SKU Configuration...</div>;
  }

  return (
    <div className="p-8 max-w-xl mx-auto mb-16">
      <h1 className="text-3xl font-bold mb-8 text-gray-900">SKU Configuration</h1>
      
      {toastMessage && (
        <div className={`mb-6 p-4 rounded-md font-medium shadow-sm border ${
          toastMessage.type === 'success' ? 'bg-green-50 text-green-800 border-green-200' : 'bg-red-50 text-red-800 border-red-200'
        }`}>
          {toastMessage.message}
        </div>
      )}

      <Layout>
        <Layout.Section>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <BlockStack gap="400">
              
              <Box>
                <TextField
                  label="Application Prefix"
                  value="STB"
                  onChange={() => {}}
                  disabled
                  autoComplete="off"
                  helpText="Application prefix is fixed and read-only."
                />
              </Box>

              <Box>
                <TextField
                  label="Product Prefix"
                  value={skuPrefix}
                  onChange={(val) => setSkuPrefix(val.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10))}
                  autoComplete="off"
                />
              </Box>
              
              <Box>
                <TextField
                  label="Starting Sequence"
                  value={skuSequence}
                  onChange={(val) => setSkuSequence(val.replace(/[^0-9]/g, '').slice(0, 6))}
                  autoComplete="off"
                  error={inlineError || undefined}
                />
              </Box>
              
              <div className="mt-2 p-3 bg-gray-50 border border-gray-100 rounded text-sm text-gray-600">
                Generated SKU Example: <Text as="span" fontWeight="bold">STB-{skuPrefix || "SHOE"}-{skuSequence ? skuSequence.toString().padStart(4, '0') : "0001"}</Text>
              </div>

              <div className="mt-4 pt-4 border-t border-gray-100 flex justify-end">
                <Button variant="primary" onClick={handleSave} loading={saving}>
                  Save
                </Button>
              </div>
            </BlockStack>
          </div>
        </Layout.Section>
      </Layout>
    </div>
  );
}
