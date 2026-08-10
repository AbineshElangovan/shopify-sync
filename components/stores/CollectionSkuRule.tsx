"use client";

import React, { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { BlockStack } from '@shopify/polaris';
import { shopifyFetch } from '@/lib/shopify/Client';
import { Loading } from '@/components/common';
import { Checkbox, Input } from '@/components/forms';

const CollectionSkuRule = forwardRef(({ 
  storeId, 
  onSelectCollection
}: { 
  storeId: string, 
  onSelectCollection: (id: string, prefix: string) => void
}, ref) => {
  const [collections, setCollections] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const [selectedCollectionId, setSelectedCollectionId] = useState<string>('');
  const [customPrefixes, setCustomPrefixes] = useState<Record<string, string>>({});

  const generatePrefix = (title: string) => {
    const words = title.trim().split(/[\s\-]+/).filter((w: string) => w.length > 0);
    let colPrefix = '';
    if (words.length === 1) {
      colPrefix = words[0].substring(0, 3).toUpperCase();
    } else if (words.length === 2) {
      colPrefix = (words[0][0] + words[1].substring(0, 2)).toUpperCase();
    } else if (words.length >= 3) {
      colPrefix = (words[0][0] + words[1][0] + words[2][0]).toUpperCase();
    }
    return colPrefix.padEnd(3, 'X').substring(0, 3);
  };

  const loadCollections = async () => {
    setLoading(true);
    try {
      const res = await shopifyFetch(`/api/stores/${storeId}/collection-sku-rules?t=${Date.now()}`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setCollections(data);

        const initialPrefixes: Record<string, string> = {};
        for (const col of data) {
          if (col.skuRule?.skuPrefix) {
            initialPrefixes[col.id] = col.skuRule.skuPrefix;
          }
        }
        setCustomPrefixes(initialPrefixes);

        // Find the currently enabled one (if any)
        const enabledCol = data.find((col: any) => col.skuRule?.enabled);
        if (enabledCol) {
          setSelectedCollectionId(enabledCol.id);
          const savedPrefix = initialPrefixes[enabledCol.id] || generatePrefix(enabledCol.title);
          onSelectCollection(enabledCol.id, savedPrefix);
        }
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

  useImperativeHandle(ref, () => ({
    async saveRules() {
      const rules = collections.map(col => ({
        collectionId: col.id,
        enabled: col.id === selectedCollectionId,
        skuPrefix: (col.id === selectedCollectionId ? customPrefixes[col.id] : '') || ''
      }));

      await shopifyFetch(`/api/stores/${storeId}/collection-sku-rules`, {
        method: 'PUT',
        body: JSON.stringify({ rules })
      });
    }
  }));

  if (loading) {
    return <Loading label="Loading collections..." />;
  }

  if (collections.length === 0) {
    return null;
  }

  return (
    <div style={{ marginTop: '24px', borderTop: '1px solid #e5e7eb', paddingTop: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '16px' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#111827' }}>
          Collection Restriction (Select One)
        </h3>
        <div style={{ width: '250px', backgroundColor: '#fdfcfd' }}>
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
      
      <div style={{ maxHeight: '300px', overflowY: 'auto', paddingRight: '8px' }}>
        <div className="flex items-center justify-between px-4 py-2 bg-purple-50 border border-purple-100 rounded-t-lg mb-2">
          <span className="text-sm font-semibold text-purple-900">Collection Name</span>
        </div>
        <BlockStack gap="300">
          {collections.filter(c => c.title.toLowerCase().includes(searchQuery.toLowerCase())).map((col) => {
            const isSelected = selectedCollectionId === col.id;
            const autoPrefix = generatePrefix(col.title);
            
            return (
              <div key={col.id} style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px',
                border: isSelected ? '1px solid #a855f7' : '1px solid #f3f4f6',
                borderRadius: '8px',
                backgroundColor: isSelected ? '#f5f3ff' : '#ffffff',
                transition: 'all 0.2s ease-in-out'
              }}>
                <div 
                  style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', flex: 1 }}
                  onClick={() => {
                    const newId = isSelected ? '' : col.id;
                    setSelectedCollectionId(newId);
                    if (newId) {
                      const prefixToUse = customPrefixes[newId] || generatePrefix(col.title);
                      onSelectCollection(newId, prefixToUse);
                    } else {
                      onSelectCollection('', '');
                    }
                  }}
                >
                  <div style={{ pointerEvents: 'none' }}>
                    <Checkbox
                      label={col.title}
                      checked={isSelected}
                      onChange={() => {}} // handled by parent div click
                    />
                  </div>
                </div>

                {isSelected && (
                  <div style={{ width: '120px' }}>
                    <input
                      type="text"
                      placeholder={autoPrefix}
                      value={customPrefixes[col.id] || ''}
                      onChange={(e) => {
                        const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
                        setCustomPrefixes(prev => ({ ...prev, [col.id]: val }));
                        onSelectCollection(col.id, val || autoPrefix);
                      }}
                      className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-purple-500 focus:border-purple-500 uppercase"
                      maxLength={5}
                    />
                  </div>
                )}
              </div>
            );
          })}
          {collections.filter(c => c.title.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 && (
             <div style={{ padding: '20px', textAlign: 'center', color: '#6b7280', fontSize: '13px', backgroundColor: '#f9fafb', borderRadius: '8px', border: '1px dashed #e5e7eb' }}>
               No collections match your search.
             </div>
          )}
        </BlockStack>
      </div>
    </div>
  );
});

export default CollectionSkuRule;
