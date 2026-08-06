"use client";
import React, { useState, useEffect, useRef } from 'react';
import { shopifyFetch } from '@/lib/shopify/Client';
import { Loading } from '@/components/common';
import CollectionSkuRule from '@/components/stores/CollectionSkuRule';
import { Input } from '@/components/forms/Input';
import { StoreRoleBadge } from '@/components/ui/StoreRoleBadge';

export default function SkuSettingsPage() {
  const [skuPrefix, setSkuPrefix] = useState('SHOE');
  const [skuSequence, setSkuSequence] = useState('0001');

  const [storeId, setStoreId] = useState('');
  const [storeName, setStoreName] = useState('');
  
  const [selectedCollectionPrefix, setSelectedCollectionPrefix] = useState('');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isMaster, setIsMaster] = useState(true);
  const [toastMessage, setToastMessage] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [inlineError, setInlineError] = useState<string | null>(null);

  const collectionRuleRef = useRef<any>(null);

  useEffect(() => {
    fetchSettings();
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

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const res = await shopifyFetch('/api/settings/sku');
      const data = await res.json();
      if (data.success && data.setting) {
        setSkuPrefix(data.setting.skuPrefix || 'SHOE');

        // Ensure sequence displays nicely as 4 digits minimum
        const seq = data.setting.skuSequence || 1;
        setSkuSequence(seq.toString().padStart(4, '0'));
        setIsMaster(data.isMaster !== false);
        setStoreId(data.setting.storeId);
        setStoreName(data.storeName || 'Store');
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
      // 1. Save SKU Prefix and Sequence
      const res = await shopifyFetch('/api/settings/sku', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skuPrefix, skuSequence })
      });
      const data = await res.json();

      // 2. Save Collection Rule via Ref
      if (collectionRuleRef.current && isMaster) {
        await collectionRuleRef.current.saveRules();
      }

      if (data.success) {
        setSkuPrefix(data.setting.skuPrefix);
        setSkuSequence(data.setting.skuSequence.toString().padStart(4, '0'));
        setToastMessage({ message: '✅ SKU configuration and collection rules saved successfully.', type: 'success' });
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
    return <Loading label="Loading SKU rules..." />;
  }

  const generatedPreview = `STB-${skuPrefix || "SHOE"}-${selectedCollectionPrefix ? selectedCollectionPrefix + '-' : ''}${skuSequence ? skuSequence.toString().padStart(4, '0') : "0001"}`;

  return (
    <div className="p-8 max-w-4xl mx-auto mb-16">
      <div className="mb-6 border-b border-gray-200 pb-4 flex items-center justify-between">
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827', margin: 0 }}>
            SKU Configuration
          </h1>
          <p style={{ marginTop: 4, color: '#6b7280', fontSize: '0.875rem' }}>
            Manage product prefixes, sequence rules, and collection restrictions.
          </p>
        </div>
        <StoreRoleBadge />
      </div>

      {!isMaster && (
        <div className="mb-6 p-4 rounded-md font-medium shadow-sm border bg-red-50 text-red-800 border-red-200">
          ⚠ Only the Master Store can configure SKU settings. These settings are read-only for this store.
        </div>
      )}

      {isMaster && (
        <div className="mb-6 p-4 bg-blue-50 text-blue-800 rounded-md border border-blue-200 text-sm">
          <strong>Note:</strong> SKU Sequence and Prefix are managed here. The Collections list below is read-only and automatically syncs from Shopify.
        </div>
      )}

      <div className="flex flex-col gap-6">
          <div style={{ backgroundColor: '#f0fdfa', border: `1px solid #ccfbf1`, borderRadius: '12px', padding: '24px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
            <div style={{ marginBottom: '24px', borderLeft: `6px solid #0a9984`, paddingLeft: '16px' }}>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#115e59', margin: 0 }}>
                SKU Generation Rules
              </h2>
              <p style={{ marginTop: '6px', color: '#0f766e', fontSize: '1rem' }}>
                Define how SKUs are automatically generated for products missing a valid SKU.
              </p>
            </div>
            
            <div className="bg-white rounded-lg p-6 border border-teal-100 shadow-sm flex flex-col gap-4">
                <div>
                  <Input
                    label="Product Prefix"
                    prefix="STB -"
                    value={skuPrefix}
                    onChange={(val) => setSkuPrefix(val.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10))}
                    autoComplete="off"
                    disabled={!isMaster}
                  />
                </div>

                <div>
                  <Input
                    label="Starting Sequence"
                    value={skuSequence}
                    onChange={(val) => setSkuSequence(val.replace(/[^0-9]/g, '').slice(0, 6))}
                    autoComplete="off"
                    error={inlineError || undefined}
                    disabled={!isMaster}
                  />
                </div>

                {storeId && (
                  <div>
                    <CollectionSkuRule 
                      ref={collectionRuleRef}
                      storeId={storeId} 
                      onSelectCollection={(id, prefix) => setSelectedCollectionPrefix(prefix)}
                    />
                  </div>
                )}

                <div className="mt-4 p-4 bg-teal-50 border-2 border-teal-200 rounded-lg shadow-sm text-center">
                  <p className="text-gray-500 text-sm mb-2">Generated SKU Example</p>
                  <span className="text-xl font-bold text-[#0a9984]">
                    {generatedPreview}
                  </span>
                </div>

                <div className="mt-6 pt-4 border-t border-teal-100 flex justify-end items-center gap-4">
                  {toastMessage && (
                    <span className={`text-sm font-medium ${toastMessage.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                      {toastMessage.message}
                    </span>
                  )}
                  <button className="px-4 py-2 bg-[#0a9984] text-white text-sm font-semibold rounded-lg hover:bg-[#087d6c] transition-colors shadow-sm disabled:opacity-50" onClick={handleSave} disabled={saving || !isMaster}>
                    {saving ? 'Saving...' : 'Save Configuration'}
                  </button>
                </div>
            </div>
          </div>
      </div>
    </div>
  );
}
