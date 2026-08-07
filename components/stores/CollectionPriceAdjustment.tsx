"use client";

import React, { useState, useEffect } from 'react';
import { Button, BlockStack, InlineStack } from '@shopify/polaris';
import { shopifyFetch } from '@/lib/shopify/Client';
import { Checkbox, Input, Select } from '@/components/forms';
import { Loading } from '@/components/common';

export default function CollectionPriceAdjustment({ storeId, storeName }: { storeId: string, storeName: string }) {
  const [collections, setCollections] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [message, setMessage] = useState<{ text: string, type: 'success' | 'error' } | null>(null);
  const [bulkValue, setBulkValue] = useState('');

  const [showDropdown, setShowDropdown] = useState(false);

  // State maps keyed by collectionId
  const [enabledMap, setEnabledMap] = useState<{ [id: string]: boolean }>({});
  const [typeMap, setTypeMap] = useState<{ [id: string]: string }>({});
  const [valueMap, setValueMap] = useState<{ [id: string]: string }>({});

  const loadCollections = async () => {
    setLoading(true);
    try {
      const res = await shopifyFetch(`/api/stores/${storeId}/collection-adjustments?t=${Date.now()}`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setCollections(data);

        const newEnabled: any = {};
        const newType: any = {};
        const newValue: any = {};

        data.forEach((col: any) => {
          const adj = col.priceAdjustment;
          newEnabled[col.id] = adj?.enabled || false;
          newValue[col.id] = adj?.adjustmentValue?.toString() || '0';
        });

        setEnabledMap(newEnabled);
        setTypeMap(newType);
        setValueMap(newValue);
      }
    } catch (err) {
      console.error("Failed to load collections", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (storeId) {
      loadCollections();
    }
  }, [storeId]);


  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (!(e.target as Element).closest('.collection-dropdown-container')) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);

    const adjustments = collections.map(col => ({
      collectionId: col.id,
      enabled: !!enabledMap[col.id],
      adjustmentType: 'PERCENTAGE',
      adjustmentValue: valueMap[col.id] || '0'
    }));

    try {
      const res = await shopifyFetch(`/api/stores/${storeId}/collection-adjustments`, {
        method: 'PUT',
        body: JSON.stringify({ adjustments })
      });

      if (res.ok) {
        setMessage({ text: '✓ Collection adjustments saved successfully.', type: 'success' });
        setTimeout(() => setMessage(null), 3000);
      } else {
        setMessage({ text: '✕ Failed to save adjustments.', type: 'error' });
        setTimeout(() => setMessage(null), 3000);
      }
    } catch (err) {
      setMessage({ text: '✕ Failed to save adjustments.', type: 'error' });
      setTimeout(() => setMessage(null), 3000);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <Loading label="Loading collections..." />;
  }

  const activeCollections = collections.filter(c => enabledMap[c.id]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#111827' }}>
          Collection Price Adjustments for {storeName}
        </h3>
        {collections.length > 0 && (
          <div style={{ width: '220px' }}>
            <Input
              type="text"
              label="Search collections"
              labelHidden
              placeholder="Search collections..."
              value={searchQuery}
              onChange={(val) => setSearchQuery(val)}
              autoComplete="off"
            />
          </div>
        )}
      </div>

      {collections.length === 0 ? (
        <div style={{ padding: '40px 20px', textAlign: 'center', color: '#6b7280', fontSize: '14px', backgroundColor: '#f9fafb', borderRadius: '8px', border: '1px dashed #e5e7eb' }}>
          No collections synced yet for this store.
        </div>
      ) : (
        <>

          {/* Table Header */}
          <div className="flex items-center justify-between px-3 py-2 bg-gray-100 border border-gray-200 border-b-0 rounded-t-md text-sm font-semibold text-gray-700">
            <div style={{ minWidth: '150px' }}>Collection Name</div>
            <div style={{ width: '120px', textAlign: 'center' }}>Adjustment (%)</div>
          </div>

          <div className="border border-gray-200 rounded-b-md bg-gray-50/50 max-h-64 overflow-y-auto">
            {collections.filter(c => c.title.toLowerCase().includes(searchQuery.toLowerCase())).map((col) => {
              const isEnabled = enabledMap[col.id];
              return (
                <div key={col.id}
                  className={`p-3 border-b border-gray-200 last:border-b-0 transition-colors ${isEnabled ? 'bg-indigo-50 hover:bg-indigo-100' : 'bg-white hover:bg-gray-50'}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '12px'
                  }}>
                  <div style={{ minWidth: '150px' }}>
                    <Checkbox
                      label={col.title}
                      checked={isEnabled}
                      onChange={(val) => setEnabledMap(prev => ({ ...prev, [col.id]: val }))}
                    />
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', opacity: isEnabled ? 1 : 0.5, pointerEvents: isEnabled ? 'auto' : 'none' }}>
                    <span style={{ fontSize: '13px', color: '#374151', fontWeight: 500 }}>Adjustment:</span>
                    <div style={{ width: '80px' }}>
                      <Input
                        type="text"
                        label="Value"
                        labelHidden
                        value={valueMap[col.id]}
                        onChange={(val) => {
                          let numericValue = val.replace(/[^0-9]/g, '');
                          if (numericValue.length > 1 && numericValue.startsWith('0')) {
                            numericValue = numericValue.replace(/^0+/, '');
                          }
                          if (numericValue === '') numericValue = '0';
                          setValueMap(prev => ({ ...prev, [col.id]: numericValue }));
                        }}
                        autoComplete="off"
                      />
                    </div>
                    <span style={{ fontSize: '13px', color: '#374151', fontWeight: 500 }}>%</span>
                  </div>
                </div>
              );
            })}
            {collections.filter(c => c.title.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 && (
              <div style={{ padding: '20px', textAlign: 'center', color: '#6b7280', fontSize: '13px', backgroundColor: '#f9fafb' }}>
                No collections match your search.
              </div>
            )}
          </div>

          <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className="px-3 py-1.5 bg-[var(--color-primary)] text-white text-[13px] font-semibold rounded-md hover:bg-[var(--color-primary-dark)] transition-colors shadow-sm"
                  onClick={() => {
                    const newMap = { ...enabledMap };
                    collections.forEach(c => {
                      if (c.title.toLowerCase().includes(searchQuery.toLowerCase())) {
                        newMap[c.id] = true;
                      }
                    });
                    setEnabledMap(newMap);
                  }}
                >
                  Select All
                </button>
                <button
                  type="button"
                  className="px-3 py-1.5 bg-[var(--color-primary)] text-white text-[13px] font-semibold rounded-md hover:bg-[var(--color-primary-dark)] transition-colors shadow-sm"
                  onClick={() => {
                    const newMap = { ...enabledMap };
                    collections.forEach(c => {
                      if (c.title.toLowerCase().includes(searchQuery.toLowerCase())) {
                        newMap[c.id] = false;
                      }
                    });
                    setEnabledMap(newMap);
                  }}
                >
                  Deselect All
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingLeft: '16px', borderLeft: '1px solid #e5e7eb' }}>
                <span style={{ fontSize: '13px', color: '#374151', fontWeight: 500 }}>Bulk Apply:</span>
                <div style={{ width: '70px' }}>
                  <Input
                    type="text"
                    label="Bulk Value"
                    labelHidden
                    placeholder="0"
                    value={bulkValue}
                    onChange={(val) => {
                      let numericValue = val.replace(/[^0-9]/g, '');
                      setBulkValue(numericValue);
                      
                      // Auto-apply to selected collections immediately!
                      const newValueMap = { ...valueMap };
                      collections.forEach(c => {
                        if (enabledMap[c.id]) {
                          newValueMap[c.id] = numericValue || '0';
                        }
                      });
                      setValueMap(newValueMap);
                    }}
                    autoComplete="off"
                  />
                </div>
                <span style={{ fontSize: '13px', color: '#374151', fontWeight: 500 }}>%</span>
               
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {message && (
                <span style={{ color: message.type === 'success' ? '#16a34a' : '#dc2626', fontSize: '13px', fontWeight: 500 }}>
                  {message.text}
                </span>
              )}
              <button
                type="button"
                disabled={saving}
                className="px-4 py-2 bg-[var(--color-primary)] text-white text-sm font-semibold rounded-lg hover:bg-[var(--color-primary-dark)] transition-colors shadow-sm disabled:opacity-50"
                onClick={handleSave}
              >
                {saving ? 'Saving...' : 'Save Collection'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
