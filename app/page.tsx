"use client";

import React, { useState, useEffect } from 'react';
import { BlockStack, Layout } from '@shopify/polaris';
import { DashboardCards } from '@/components/dashboard/DashboardCards';
import { DashboardCharts } from '@/components/dashboard/DashboardCharts';
import { Table, ColumnConfig } from '@/components/common/Table';
import { shopifyFetch } from '@/lib/shopify/Client';

export default function DashboardPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    async function loadDashboardData() {
      try {
        const res = await shopifyFetch('/api/dashboard');
        if (res.ok) {
          const json = await res.json();
          setData(json);
        } else {
          // If the backend returns 500/401, it means the store is not installed in the DB.
          // Automatically redirect to the OAuth flow to install the store.
          const urlParams = new URLSearchParams(window.location.search);
          const shop = urlParams.get('shop');
          const host = urlParams.get('host');
          if (shop) {
             const authUrl = new URL('/api/auth', window.location.origin);
             authUrl.searchParams.set('shop', shop);
             if (host) authUrl.searchParams.set('host', host);
             window.location.href = authUrl.toString();
             return;
          }
        }
      } catch (err) {
        console.error("Error loading dashboard data:", err);
      } finally {
        setLoading(false);
      }
    }

    // Initial load
    loadDashboardData();

    // Poll every 10 seconds for dynamic updates
    intervalId = setInterval(loadDashboardData, 10000);

    const handleFocus = () => loadDashboardData();
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        loadDashboardData();
      }
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '50vh', gap: 14 }}>
        <style>{`@keyframes sync-spin{to{transform:rotate(360deg)}}.ys-sync-ring{width:44px;height:44px;border-radius:50%;border:4px solid #e5e7eb;border-top-color:#6366f1;animation:sync-spin 0.75s linear infinite}`}</style>
        <div className="ys-sync-ring" />
        <p style={{ margin: 0, fontSize: 13, color: '#9ca3af', fontWeight: 500 }}>Loading dashboard…</p>
      </div>
    );
  }

  const stats = data?.stats || { totalProducts: 0, totalInventory: 0, lowStock: 0, activeProducts: 0, lastUpdated: 'Never' };
  const lowStockThreshold = data?.lowStockThreshold ?? 10;
  const storeSummaryData = (data?.stores || []).map((store: any) => ({
    id: store.id,
    storeName: store.label || store.shopDomain,
    totalProducts: store.productCount,
    totalInventory: store.inventoryTotal,
    activeProducts: store.activeProductCount,
    lastSynced: stats.lastUpdated,
  }));

  const storeSummaryColumns: ColumnConfig[] = [
    { title: 'Store Name', key: 'storeName', type: 'bold' },
    { title: 'Total Products', key: 'totalProducts' },
    { title: 'Total Inventory', key: 'totalInventory' },
    { title: 'Active Products', key: 'activeProducts' },
    { title: 'Last Synced', key: 'lastSynced' },
  ];

  const lowStockProducts = (data?.lowStockProducts || []).map((p: any) => ({
    id: p.id,
    imageUrls: p.imageUrls || (p.imageUrl ? [p.imageUrl] : []),
    title: p.title,
    sku: p.sku || 'N/A',
    inventoryQuantity: p.inventoryQuantity,
    stockLevel: p.inventoryQuantity <= 5 ? 'Critical' : 'Low',
    updatedDate: new Date(p.updatedAt).toLocaleDateString('en-US'),
    updatedTime: new Date(p.updatedAt).toLocaleTimeString('en-US'),
  }));

  const lowStockColumns: ColumnConfig[] = [
    { title: 'Image', key: 'imageUrls', type: 'image' },
    { title: 'Product Name', key: 'title', type: 'bold' },
    { title: 'SKU', key: 'sku' },
    { title: 'Quantity', key: 'inventoryQuantity', type: 'bold' },
    { title: 'Stock Level', key: 'stockLevel', type: 'badge', badgeRules: { Critical: 'critical', Low: 'warning' } },
    { title: 'Updated Date', key: 'updatedDate' },
    { title: 'Updated Time', key: 'updatedTime' },
  ];

  const recentlyAddedProducts = (data?.recentlyAddedProducts || []).map((p: any) => ({
    id: p.id,
    imageUrls: p.imageUrls || (p.imageUrl ? [p.imageUrl] : []),
    title: p.title,
    vendor: 'ESHAN',
    sku: p.sku || 'N/A',
    inventoryQuantity: p.inventoryQuantity,
    status: 'Active',
    addedDate: new Date(p.updatedAt).toLocaleDateString('en-US'),
    addedTime: new Date(p.updatedAt).toLocaleTimeString('en-US'),
  }));

  const recentlyAddedColumns: ColumnConfig[] = [
    { title: 'Image', key: 'imageUrls', type: 'image' },
    { title: 'Product Name', key: 'title', type: 'bold' },
    { title: 'Vendor', key: 'vendor' },
    { title: 'SKU', key: 'sku' },
    { title: 'Stock', key: 'inventoryQuantity', type: 'bold' },
    { title: 'Status', key: 'status', type: 'badge', badgeRules: { Active: 'success' } },
    { title: 'Added Date', key: 'addedDate' },
    { title: 'Added Time', key: 'addedTime' },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <BlockStack gap="800">
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827', margin: 0 }}>
            Inventory Dashboard
          </h1>
          <p style={{ marginTop: '4px', color: '#6b7280', fontSize: '0.875rem' }}>
            Live overview of your connected Shopify store
          </p>
        </div>

        <DashboardCards stats={stats} lowStockThreshold={lowStockThreshold} />

        <DashboardCharts chartData={{ 
          combinedData: data?.stores ? data.stores.map((s: any) => ({
            name: s.label || s.shopDomain,
            'Total Products': s.productCount,
            'Total Inventory': s.inventoryTotal,
            'Total Sales Value': s.salesValue,
          })) : [],
          currentStoreData: data?.stores ? data.stores.filter((s: any) => s.id === data.currentStoreId).map((s: any) => ({
            name: s.label || s.shopDomain,
            'Total Products': s.productCount,
            'Total Inventory': s.inventoryTotal,
            'Total Sales Value': s.salesValue,
          })) : []
        }} />

        <Layout>
          <Layout.Section>
            <Table
              title="Store Summary"
              headerColor="#0f766e"
              columns={storeSummaryColumns}
              items={storeSummaryData}
              searchable={false}
              filterable={false}
              paginate={false}
              emptyState={
                <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>
                  No store data available.
                </div>
              }
            />
          </Layout.Section>
        </Layout>

        <Layout>
          <Layout.Section>
            <Table
              title="Low Stock Products"
              headerColor="#ea580c"
              columns={lowStockColumns}
              items={lowStockProducts}
              searchable
              searchKey="title"
              filterable
              filterKey="stockLevel"
              filterOptions={[
                { label: 'All', value: 'ALL' },
                { label: 'Critical', value: 'Critical' },
                { label: 'Low', value: 'Low' },
              ]}
              emptyState={
                <div style={{ padding: '40px', textAlign: 'center', color: '#16a34a' }}>
                  All inventory levels are healthy.
                </div>
              }
            />
          </Layout.Section>
        </Layout>

        <Layout>
          <Layout.Section>
            <Table
              title="Recently Added Products"
              headerColor="#0891b2"
              columns={recentlyAddedColumns}
              items={recentlyAddedProducts}
              searchable
              searchKey="title"
              filterable={false}
              emptyState={
                <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>
                  No recently added products.
                </div>
              }
            />
          </Layout.Section>
        </Layout>
      </BlockStack>
    </div>
  );
}
