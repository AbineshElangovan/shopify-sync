"use client";

import React, { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { BlockStack } from '@shopify/polaris';
import { shopifyFetch } from '@/lib/shopify/Client';
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

  // Store the single selected collection ID
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>('');

  const loadCollections = async () => {
    setLoading(true);
    try {
      const res = await shopifyFetch(`/api/stores/${storeId}/collection-sku-rules?t=${Date.now()}`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setCollections(data);

        // Find the currently enabled one (if any)
        const enabledCol = data.find((col: any) => col.skuRule?.enabled);
        if (enabledCol) {
          setSelectedCollectionId(enabledCol.id);
          const words = enabledCol.title.trim().split(/[\s\-]+/).filter((w: string) => w.length > 0);
          let colPrefix = '';
          if (words.length === 1) {
            colPrefix = words[0].substring(0, 3).toUpperCase();
          } else if (words.length === 2) {
            colPrefix = (words[0][0] + words[1].substring(0, 2)).toUpperCase();
          } else if (words.length >= 3) {
            colPrefix = (words[0][0] + words[1][0] + words[2][0]).toUpperCase();
          }
          colPrefix = (colPrefix || 'COL').padEnd(3, 'X').substring(0, 3);
          onSelectCollection(enabledCol.id, colPrefix);
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
        enabled: col.id === selectedCollectionId
      }));

      await shopifyFetch(`/api/stores/${storeId}/collection-sku-rules`, {
        method: 'PUT',
        body: JSON.stringify({ rules })
      });
    }
  }));

  if (loading) {
    return <div style={{ marginTop: '16px', fontSize: '13px', color: '#6b7280' }}>Loading collections...</div>;
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
        <BlockStack gap="300">
          {collections.filter(c => c.title.toLowerCase().includes(searchQuery.toLowerCase())).map((col) => {
            const isSelected = selectedCollectionId === col.id;
            
            return (
              <div key={col.id} style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-start',
                padding: '12px',
                border: isSelected ? '1px solid #a855f7' : '1px solid #f3f4f6',
                borderRadius: '8px',
                backgroundColor: isSelected ? '#f5f3ff' : '#ffffff',
                cursor: 'pointer',
                transition: 'all 0.2s ease-in-out'
              }}
              onClick={() => {
                const newId = isSelected ? '' : col.id;
                setSelectedCollectionId(newId);
                let colPrefix = '';
                if (newId) {
                  const words = col.title.trim().split(/[\s\-]+/).filter((w: string) => w.length > 0);
                  if (words.length === 1) {
                    colPrefix = words[0].substring(0, 3).toUpperCase();
                  } else if (words.length === 2) {
                    colPrefix = (words[0][0] + words[1].substring(0, 2)).toUpperCase();
                  } else if (words.length >= 3) {
                    colPrefix = (words[0][0] + words[1][0] + words[2][0]).toUpperCase();
                  }
                  colPrefix = colPrefix.padEnd(3, 'X').substring(0, 3); // ensure exactly 3 chars just in case
                }
                onSelectCollection(newId, colPrefix);
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
