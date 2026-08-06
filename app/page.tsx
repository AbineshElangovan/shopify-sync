"use client";

import React, { useState, useEffect } from 'react';
import { DashboardCards } from '@/components/dashboard/DashboardCards';
import { StoreRoleBadge } from '@/components/ui/StoreRoleBadge';
import { DashboardCharts } from '@/components/dashboard/DashboardCharts';
import { Table, Loading } from '@/components/common';
import type { ColumnConfig } from '@/components/common/Table';
import { shopifyFetch } from '@/lib/shopify/Client';
import { LocalizedDate } from '@/components/common/LocalizedDate';

export default function DashboardPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {

    async function loadDashboardData() {
      try {
        const res = await shopifyFetch('/api/dashboard');
        if (res.ok) {
          const json = await res.json();
          setData(json);
        } else {
          try {
            const errorData = await res.json();
            
            if (res.status === 401 && errorData.message === "Store not installed or inactive") {
              console.warn("[Dashboard] Store is missing from database. Redirecting to OAuth to reinstall...");
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
            } else if (res.status === 401) {
              console.warn("[Dashboard] Session token expired or invalid (401). App bridge should handle refreshing the token.");
            } else {
              console.error(`[Dashboard] API returned an error: ${res.status} ${res.statusText}`, errorData);
            }
          } catch(e) {
            console.error(`[Dashboard] API returned an error: ${res.status} ${res.statusText}`);
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

    const handleFocus = () => loadDashboardData();
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        loadDashboardData();
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
    return <Loading label="Loading dashboard..." />;
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
    updatedDate: <LocalizedDate date={p.updatedAt} format="date" />,
    updatedTime: <LocalizedDate date={p.updatedAt} format="time" />,
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
    addedDate: <LocalizedDate date={p.updatedAt} format="date" />,
    addedTime: <LocalizedDate date={p.updatedAt} format="time" />,
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
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 w-full overflow-x-hidden">
      <div className="flex flex-col gap-8 min-w-0 w-full">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827', margin: 0 }}>
              Inventory Dashboard
            </h1>
            <p style={{ marginTop: 4, color: '#6b7280', fontSize: '0.875rem' }}>
              Live overview of your connected Shopify store.
            </p>
          </div>
          <div>
            <StoreRoleBadge />
          </div>
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

        <div className="w-full overflow-hidden">
          <div className="overflow-x-auto w-full max-w-full">
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
          </div>
        </div>

        <div className="w-full overflow-hidden">
          <div className="overflow-x-auto w-full max-w-full">
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
          </div>
        </div>

        <div className="w-full overflow-hidden">
          <div className="overflow-x-auto w-full max-w-full">
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
          </div>
        </div>
      </div>
    </div>
  );
}
