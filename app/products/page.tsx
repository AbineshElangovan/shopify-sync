"use client";

import React, { useState, useEffect } from 'react';
import { Table, ColumnConfig } from '@/components/common/Table';
import { BlockStack } from '@shopify/polaris';
import { shopifyFetch } from '@/lib/shopify/Client';

export default function ProductsPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadProducts() {
      try {
        const res = await shopifyFetch('/api/products');
        if (res.ok) {
          const json = await res.json();
          setData(json);
        }
      } catch (err) {
        console.error("Error loading products:", err);
      } finally {
        setLoading(false);
      }
    }
    loadProducts();
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '50vh', gap: 14 }}>
        <style>{`@keyframes sync-spin{to{transform:rotate(360deg)}}.sync-ring{width:44px;height:44px;border-radius:50%;border:4px solid #e5e7eb;border-top-color:#6366f1;animation:sync-spin 0.75s linear infinite}`}</style>
        <div className="sync-ring" />
        <p style={{ margin: 0, fontSize: 13, color: '#9ca3af', fontWeight: 500 }}>Loading products…</p>
      </div>
    );
  }

  const stats = data?.stats || { totalProducts: 0, activeProducts: 0, totalInventory: 0, lowStock: 0 };
  const groupedProducts = data?.groupedProducts || {};

  const columns: ColumnConfig[] = [
    { title: 'Image',        key: 'imageUrl',          type: 'image' },
    { title: 'Product Name', key: 'title',             type: 'bold'  },
    { title: 'SKU',          key: 'sku'                               },
    { title: 'Store',        key: 'store'                             },
    { title: 'Stock Qty',    key: 'inventoryQuantity', type: 'bold'  },
    {
      title: 'Stock Level',
      key: 'stockLevel',
      type: 'badge',
      badgeRules: {
        Healthy:       'success',
        Low:           'warning',
        Critical:      'critical',
        'Out of Stock':'critical',
      },
    },
    {
      title: 'Status',
      key: 'status',
      type: 'badge',
      badgeRules: { Active: 'success', Inactive: 'critical' },
    },
    { title: 'Updated Date', key: 'updatedDate' },
    { title: 'Updated Time', key: 'updatedTime' },
  ];

  const STAT_CARDS = [
    { label: 'Total Products',  value: stats.totalProducts,  color: '#6366f1' },
    { label: 'Active Products', value: stats.activeProducts, color: '#16a34a' },
    { label: 'Total Inventory', value: stats.totalInventory, color: '#0891b2' },
    { label: 'Low / Critical',  value: stats.lowStock,       color: '#ea580c' },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <BlockStack gap="800">
        {/* Page Heading */}
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827', margin: 0 }}>
            Products
          </h1>
          <p style={{ marginTop: 4, color: '#6b7280', fontSize: '0.875rem' }}>
            Products and collections for your connected store
          </p>
        </div>

        {/* Stat Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
          {STAT_CARDS.map(({ label, value, color }) => (
            <div
              key={label}
              style={{
                backgroundColor: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: 12,
                padding: '20px 24px',
                borderLeft: `4px solid ${color}`,
                boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
              }}
            >
              <p style={{ margin: 0, fontSize: 12, color: '#6b7280', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {label}
              </p>
              <p style={{ margin: '8px 0 0', fontSize: 28, fontWeight: 700, color }}>
                {value.toLocaleString('en-US')}
              </p>
            </div>
          ))}
        </div>

        {/* Products Table Grouped by Collection */}
        {Object.keys(groupedProducts).length > 0 ? (
          Object.entries(groupedProducts).map(([collectionName, items]) => (
            <Table
              key={collectionName}
              title={collectionName}
              headerColor={collectionName === 'Uncategorized' ? '#475569' : '#6366f1'}
              columns={columns}
              items={items as any[]}
              searchable
              searchKey="title"
              filterable
              filterKey="stockLevel"
              filterOptions={[
                { label: 'All Stock Levels', value: 'ALL'          },
                { label: 'Healthy',          value: 'Healthy'      },
                { label: 'Low',              value: 'Low'          },
                { label: 'Critical',         value: 'Critical'     },
                { label: 'Out of Stock',     value: 'Out of Stock' },
              ]}
              emptyState={
                <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>
                  No products found in this collection.
                </div>
              }
            />
          ))
        ) : (
          <div style={{ backgroundColor: '#fff', padding: '60px', borderRadius: 12, border: '1px solid #e5e7eb', textAlign: 'center', color: '#6b7280' }}>
            No products or collections synced for this store yet.
          </div>
        )}
      </BlockStack>
    </div>
  );
}
