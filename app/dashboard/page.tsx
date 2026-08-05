import { prisma } from '@/lib/db/prisma';
import { DashboardCards } from '@/components/dashboard/DashboardCards';
import { DashboardCharts } from '@/components/dashboard/DashboardCharts';
import { Table, ColumnConfig } from '@/components/common/Table';
import { LocalizedDate } from '@/components/common/LocalizedDate';
import { TableCard } from '@/components/ui/TableCard';
import { StoreRoleBadge } from '@/components/ui/StoreRoleBadge';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {

  // Read threshold from store settings so it updates when changed in Settings
  const primaryStore = await prisma.store.findFirst({ where: { isActive: true } });
  const lowStockThreshold = primaryStore?.lowStockThreshold ?? 10;

  const totalProducts = await prisma.productCache.count();
  const invResult = await prisma.productCache.aggregate({ _sum: { inventoryQuantity: true } });
  const totalInventory = invResult._sum.inventoryQuantity ?? 0;
  const activeProducts = await prisma.productCache.count({ where: { inventoryQuantity: { gt: 0 } } });
  const lowStockCount = await prisma.productCache.count({ where: { inventoryQuantity: { lte: lowStockThreshold } } });

  const latestSync = await prisma.syncLog.findFirst({ orderBy: { createdAt: 'desc' } });
  let timeStr = 'Just now';
  if (latestSync) {
    const diffMins = Math.floor((Date.now() - latestSync.createdAt.getTime()) / 60000);
    timeStr = diffMins < 1 ? 'Just now' : diffMins < 60 ? `${diffMins} mins ago` : `${Math.floor(diffMins / 60)} hrs ago`;
  }

  const stats = { totalProducts, totalInventory, lowStock: lowStockCount, activeProducts, lastUpdated: timeStr };

  // ── Chart data – one combined array per store ──
  const stores = await prisma.store.findMany({ include: { productCaches: true } });

  const combinedData = stores.map((s) => {
    const products = s.productCaches.length;
    const inventory = s.productCaches.reduce((acc, p) => acc + p.inventoryQuantity, 0);
    // "Total Sales Value" = inventory × avg price proxy (₹500 per unit since no orders table)
    const salesValue = inventory * 500;
    return {
      name: s.label || s.shopDomain,
      'Total Products': products,
      'Total Inventory': inventory,
      'Total Sales Value': salesValue,
    };
  });

  const chartData = { combinedData, currentStoreData: combinedData };

  // ── Store Summary Table ──
  const storeSummaryData = stores.map((store) => ({
    id: store.id,
    storeName: (
      <div className="flex items-center gap-2">
        <span className="font-semibold text-gray-900">{store.label || store.shopDomain}</span>
        {store.isMaster && (
          <span className="px-2 py-0.5 bg-[var(--color-primary-light)] text-[var(--color-primary-dark)] text-[10px] font-bold rounded border border-[var(--color-primary)] uppercase tracking-wider">
            Master
          </span>
        )}
      </div>
    ),
    totalProducts: store.productCaches.length,
    totalInventory: store.productCaches.reduce((a, p) => a + p.inventoryQuantity, 0),
    activeProducts: store.productCaches.filter((p) => p.inventoryQuantity > 0).length,
    lastSynced: timeStr,
  }));

  const storeSummaryColumns: ColumnConfig[] = [
    { title: 'Store Name', key: 'storeName', type: 'react_node' },
    { title: 'Total Products', key: 'totalProducts' },
    { title: 'Total Inventory', key: 'totalInventory' },
    { title: 'Active Products', key: 'activeProducts' },
    { title: 'Last Synced', key: 'lastSynced' },
  ];

  // ── Low Stock Products Table ──
  const lowStockRaw = await prisma.productCache.findMany({
    where: { 
      storeId: primaryStore?.id,
      inventoryQuantity: { lte: lowStockThreshold } 
    },
    orderBy: { inventoryQuantity: 'asc' },
    take: 100,
  });

  const lowStockProducts = lowStockRaw.map((p) => ({
    id: p.id,
    imageUrl: p.imageUrl,
    title: p.title,
    sku: p.sku || 'N/A',
    inventoryQuantity: p.inventoryQuantity,
    stockLevel: p.inventoryQuantity <= 5 ? 'Critical' : 'Low',
    updatedDate: <LocalizedDate date={p.updatedAt} format="date" />,
    updatedTime: <LocalizedDate date={p.updatedAt} format="time" />,
  }));

  const lowStockColumns: ColumnConfig[] = [
    { title: 'Image', key: 'imageUrl', type: 'image' },
    { title: 'Product Name', key: 'title', type: 'bold' },
    { title: 'SKU', key: 'sku' },
    { title: 'Quantity', key: 'inventoryQuantity', type: 'bold' },
    { title: 'Stock Level', key: 'stockLevel', type: 'badge', badgeRules: { Critical: 'critical', Low: 'warning' } },
    { title: 'Updated Date', key: 'updatedDate' },
    { title: 'Updated Time', key: 'updatedTime' },
  ];

  // ── Recently Added Products Table ──
  const recentlyAddedRaw = await prisma.productCache.findMany({
    where: { storeId: primaryStore?.id },
    orderBy: { updatedAt: 'desc' },
    take: 100,
  });

  const recentlyAddedProducts = recentlyAddedRaw.map((p) => ({
    id: p.id,
    imageUrl: p.imageUrl,
    title: p.title,
    vendor: 'ESHAN',
    sku: p.sku || 'N/A',
    inventoryQuantity: p.inventoryQuantity,
    status: 'Active',
    addedDate: <LocalizedDate date={p.updatedAt} format="date" />,
    addedTime: <LocalizedDate date={p.updatedAt} format="time" />,
  }));

  const recentlyAddedColumns: ColumnConfig[] = [
    { title: 'Image', key: 'imageUrl', type: 'image' },
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
      <div className="flex flex-col min-w-0 w-full">
      {/* Top Bar matching new layout */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-gray-200 mb-8 gap-4 sm:gap-0">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
            <p className="text-[13px] text-gray-500 mt-0.5">Everything syncing across {stores.length} stores, in real time</p>
          </div>
        <div className="flex flex-wrap items-center gap-3">
          <StoreRoleBadge />
          <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 text-green-700 rounded-full text-xs font-medium border border-green-100">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
            Live · {timeStr}
          </div>
          <button className="flex items-center gap-2 px-4 py-1.5 bg-[var(--color-primary-dark)] text-white text-sm font-semibold rounded-lg hover:bg-[var(--color-primary)] transition-colors shadow-sm">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Run sync
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-8">
        {/* ── Page heading ── */}
        <div className="flex flex-col lg:flex-row items-start justify-between bg-white rounded-2xl p-6 lg:p-8 border border-gray-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] gap-8 lg:gap-0">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--color-primary-50)] text-[var(--color-primary-dark)] text-xs font-semibold mb-4 border border-[var(--color-primary-200)]">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
              Overall protection is on
            </div>
            <h2 style={{ fontSize: 'clamp(1.75rem, 5vw, 2.25rem)', fontWeight: 800, color: '#111827', margin: 0, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
              {totalProducts.toLocaleString('en-US')} products, one source of truth.
            </h2>
            <p style={{ marginTop: '8px', color: '#6b7280', fontSize: '0.9375rem', maxWidth: '600px', lineHeight: 1.5 }}>
              Store Bridge is your master store. Every order placed anywhere in the network writes back to all stores within a second, and units are briefly reserved at checkout so two stores can never sell the same last item.
            </p>
            <div className="flex flex-wrap items-center gap-3 mt-6">
              <button className="flex items-center gap-2 px-4 py-2 bg-gray-50 text-gray-700 text-sm font-semibold rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                Review catalog
              </button>
              <button className="flex items-center gap-2 px-4 py-2 bg-white text-gray-700 text-sm font-semibold rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
                Setup guide
              </button>
            </div>
          </div>
          <div className="w-full lg:w-[340px] shrink-0 bg-gray-50 rounded-xl border border-gray-100 p-5">
            <h3 className="text-sm font-bold text-gray-900 mb-4">Network coverage</h3>
            <div className="space-y-4">
              {stores.map(store => (
                <div key={store.id}>
                  <div className="flex justify-between text-xs font-medium text-gray-700 mb-1.5">
                    <span>{store.label || store.shopDomain.split('.')[0]}</span>
                    <span className="text-gray-500">{store.productCaches.length}/{totalProducts}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-1.5">
                    <div className="bg-[var(--color-primary)] h-1.5 rounded-full" style={{ width: `${Math.min(100, (store.productCaches.length / (totalProducts || 1)) * 100)}%` }}></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Statistics Cards ── */}
        <DashboardCards stats={stats} lowStockThreshold={lowStockThreshold} />

        {/* ── Charts ── */}
        <DashboardCharts chartData={chartData} />

        {/* ── Store Summary ── */}
        <div className="w-full overflow-hidden">
          <TableCard title="Store Summary" description="Overview of inventory across your network">
            <div className="overflow-x-auto w-full max-w-full">
              <Table
                headerColor="var(--color-primary-dark)"
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
          </TableCard>
        </div>

        <div className="w-full overflow-hidden">
          <TableCard title="Low Stock Products" description={`Items with ${lowStockThreshold} or fewer units remaining`}>
            <div className="overflow-x-auto w-full max-w-full">
              <Table
                headerColor="var(--color-warning)"
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
                  <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-success)' }}>
                    All inventory levels are healthy.
                  </div>
                }
              />
            </div>
          </TableCard>
        </div>

        {/* ── Recently Added Products ── */}
        <div className="w-full overflow-hidden">
          <TableCard title="Recently Added Products" description="Latest products synced to the database">
            <div className="overflow-x-auto w-full max-w-full">
              <Table
                headerColor="var(--color-info)"
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
          </TableCard>
        </div>
      </div>
    </div>
    </div>
  );
}
