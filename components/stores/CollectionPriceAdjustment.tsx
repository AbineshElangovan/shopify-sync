"use client";

import React, { useState, useEffect } from 'react';
import { Button, BlockStack, InlineStack } from '@shopify/polaris';
import { shopifyFetch } from '@/lib/shopify/Client';
import { Checkbox, Input, Select } from '@/components/forms';

export default function CollectionPriceAdjustment({ storeId, storeName }: { storeId: string, storeName: string }) {
  const [collections, setCollections] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [message, setMessage] = useState<{ text: string, type: 'success' | 'error' } | null>(null);

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

  // Click outside listener to close dropdown
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
    return (
      <div style={{ padding: '20px', textAlign: 'center', color: '#6b7280', fontSize: '13px' }}>
        Loading collections...
      </div>
    );
  }

  if (collections.length === 0) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', color: '#6b7280', fontSize: '13px' }}>
        No collections synced yet.
      </div>
    );
  }

  const activeCollections = collections.filter(c => enabledMap[c.id]);

  return (
    <div style={{ marginTop: '16px', borderTop: '1px solid #e5e7eb', paddingTop: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#111827' }}>
          Collection Price Adjustments for {storeName}
        </h3>
        <div style={{ width: '250px' }}>
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
      </div>
      
      <BlockStack gap="400">

        {collections.filter(c => c.title.toLowerCase().includes(searchQuery.toLowerCase())).map((col) => (
          <div key={col.id} style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px',
            border: '1px solid #f3f4f6',
            borderRadius: '8px',
            backgroundColor: '#ffffff',
            flexWrap: 'wrap',
            gap: '12px'
          }}>
            <div style={{ minWidth: '150px' }}>
              <Checkbox
                label={col.title}
                checked={enabledMap[col.id]}
                onChange={(val) => setEnabledMap(prev => ({ ...prev, [col.id]: val }))}
              />
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', opacity: enabledMap[col.id] ? 1 : 0.5, pointerEvents: enabledMap[col.id] ? 'auto' : 'none' }}>
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
        ))}
        {collections.filter(c => c.title.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 && (
           <div style={{ padding: '20px', textAlign: 'center', color: '#6b7280', fontSize: '13px', backgroundColor: '#f9fafb', borderRadius: '8px', border: '1px dashed #e5e7eb' }}>
             No collections match your search.
           </div>
        )}
      </BlockStack>

      <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '12px', justifyContent: 'flex-end' }}>
        {message && (
          <span style={{ color: message.type === 'success' ? '#16a34a' : '#dc2626', fontSize: '13px', fontWeight: 500 }}>
            {message.text}
          </span>
        )}
        <Button variant="primary" loading={saving} onClick={handleSave}>
          Save Collection Rules
        </Button>
      </div>
    </div>
  );
}
