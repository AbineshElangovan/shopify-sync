"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { Table, ColumnConfig } from '@/components/common/Table';
import { BlockStack } from '@shopify/polaris';
import { shopifyFetch } from '@/lib/shopify/Client';
import { DashboardCards } from '@/components/dashboard/DashboardCards';

export default function ProductsPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const groupedProducts = data?.groupedProducts || {};

  const allProducts = useMemo(() => {
    if (!groupedProducts) return [];
    const flatMap = new Map<string, any>();
    Object.values(groupedProducts).forEach((items: any) => {
      items.forEach((item: any) => {
        flatMap.set(item.id, item);
      });
    });
    return Array.from(flatMap.values());
  }, [groupedProducts]);

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

    const handleFocus = () => loadProducts();
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        loadProducts();
      }
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '50vh', gap: 14 }}>
        <style>{`@keyframes sync-spin{to{transform:rotate(360deg)}}.ys-sync-ring{width:44px;height:44px;border-radius:50%;border:4px solid #e5e7eb;border-top-color:#6366f1;animation:sync-spin 0.75s linear infinite}`}</style>
        <div className="ys-sync-ring" />
        <p style={{ margin: 0, fontSize: 13, color: '#9ca3af', fontWeight: 500 }}>Loading products…</p>
      </div>
    );
  }

  const stats = data?.stats || { totalProducts: 0, activeProducts: 0, totalInventory: 0, lowStock: 0 };

  const filterProducts = (products: any[]) => {
    return products.filter((p) => {
      const q = searchQuery.toLowerCase().trim();
      if (!q) return true;
      const titleMatch = p.title?.toLowerCase().includes(q);
      const skuMatch = p.sku?.toLowerCase().includes(q);
      return titleMatch || skuMatch;
    });
  };

  const columns: ColumnConfig[] = [
    { title: 'Image', key: 'imageUrls', type: 'image' },
    { title: 'Product Name', key: 'title', type: 'bold' },
    { title: 'SKU', key: 'sku' },
    { title: 'Store', key: 'store' },
    { title: 'Price', key: 'priceText', type: 'bold' },
    { title: 'Stock Qty', key: 'inventoryQuantity', type: 'bold' },
    {
      title: 'Stock Level',
      key: 'stockLevel',
      type: 'badge',
      badgeRules: {
        Healthy: 'success',
        Low: 'warning',
        Critical: 'critical',
        'Out of Stock': 'critical',
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

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <BlockStack gap="800">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827', margin: 0 }}>
              Products & Collections
            </h1>
            <p style={{ marginTop: 4, color: '#6b7280', fontSize: '0.875rem' }}>
              Products and collections for your connected store. 
            </p>
            <div style={{ marginTop: 8, padding: '8px 12px', backgroundColor: '#eff6ff', borderLeft: '4px solid #3b82f6', borderRadius: '4px', fontSize: '0.875rem', color: '#1e3a8a' }}>
              <strong>Note:</strong> Collections are managed in Shopify Admin. This page is read-only and automatically syncs changes from Shopify.
            </div>
          </div>
          
          {/* Overall Search Bar */}
          <div className="relative w-full md:w-80 shadow-sm rounded-lg">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-gray-400">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </span>
            <input
              type="text"
              placeholder="Search by title or SKU..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
            />
          </div>
        </div>

        <DashboardCards stats={{ ...stats, lastUpdated: 'Just now' }} lowStockThreshold={data?.lowStockThreshold ?? 15} />
        {searchQuery.trim() !== '' ? (
          <Table
            key="search-results"
            title="Search Results"
            headerColor="#6366f1"
            columns={columns}
            items={filterProducts(allProducts)}
            searchable={false}
            filterable
            itemsPerPage={50}
            filterKey="stockLevel"
            filterOptions={[
              { label: 'All Stock Levels', value: 'ALL' },
              { label: 'Healthy', value: 'Healthy' },
              { label: 'Low', value: 'Low' },
              { label: 'Critical', value: 'Critical' },
              { label: 'Out of Stock', value: 'Out of Stock' },
            ]}
            emptyState={
              <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>
                No products found matching your search.
              </div>
            }
          />
        ) : Object.keys(groupedProducts).length > 0 ? (() => {
          const colors = ['#6366f1', '#0f766e', '#7c3aed', '#db2777', '#ea580c', '#0891b2'];
          return Object.entries(groupedProducts)
            .sort((a, b) => {
              if (a[0] === 'Uncategorized') return 1;
              if (b[0] === 'Uncategorized') return -1;
              return a[0].localeCompare(b[0]);
            })
            .map(([collectionName, items], index) => {
            const filteredItems = filterProducts(items as any[]);
            return (
              <Table
                key={collectionName}
                title={collectionName}
                headerColor={collectionName === 'Uncategorized' ? '#475569' : colors[index % colors.length]}
                columns={columns}
                items={filteredItems}
                searchable={false}
                filterable
                itemsPerPage={50}
                filterKey="stockLevel"
                filterOptions={[
                  { label: 'All Stock Levels', value: 'ALL' },
                  { label: 'Healthy', value: 'Healthy' },
                  { label: 'Low', value: 'Low' },
                  { label: 'Critical', value: 'Critical' },
                  { label: 'Out of Stock', value: 'Out of Stock' },
                ]}
                emptyState={
                  <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>
                    No products found in this collection.
                  </div>
                }
              />
            );
          });
        })() : (
          <div style={{ backgroundColor: '#fff', padding: '60px', borderRadius: 12, border: '1px solid #e5e7eb', textAlign: 'center', color: '#6b7280' }}>
            No products or collections synced for this store yet.
          </div>
        )}
      </BlockStack>
    </div>
  );
}
