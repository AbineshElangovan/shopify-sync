import { prisma } from '@/lib/db/prisma';
import { BlockStack, Layout } from '@shopify/polaris';
import { DashboardCards } from '@/components/dashboard/DashboardCards';
import { DashboardCharts } from '@/components/dashboard/DashboardCharts';
import { Table, ColumnConfig } from '@/components/common/Table';

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
    storeName: store.label || store.shopDomain,
    totalProducts: store.productCaches.length,
    totalInventory: store.productCaches.reduce((a, p) => a + p.inventoryQuantity, 0),
    activeProducts: store.productCaches.filter((p) => p.inventoryQuantity > 0).length,
    lastSynced: timeStr,
  }));

  const storeSummaryColumns: ColumnConfig[] = [
    { title: 'Store Name', key: 'storeName', type: 'bold' },
    { title: 'Total Products', key: 'totalProducts' },
    { title: 'Total Inventory', key: 'totalInventory' },
    { title: 'Active Products', key: 'activeProducts' },
    { title: 'Last Synced', key: 'lastSynced' },
  ];

  // ── Low Stock Products Table ──
  const lowStockRaw = await prisma.productCache.findMany({
    where: { inventoryQuantity: { lte: lowStockThreshold } },
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
    updatedDate: p.updatedAt.toLocaleDateString(),
    updatedTime: p.updatedAt.toLocaleTimeString(),
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
    addedDate: p.updatedAt.toLocaleDateString(),
    addedTime: p.updatedAt.toLocaleTimeString(),
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
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <BlockStack gap="800">

        {/* ── Page heading ── */}
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827', margin: 0 }}>
            Inventory Dashboard
          </h1>
          <p style={{ marginTop: '4px', color: '#6b7280', fontSize: '0.875rem' }}>
            Live overview of your connected Shopify stores
          </p>
        </div>

        {/* ── Statistics Cards ── */}
        <DashboardCards stats={stats} lowStockThreshold={lowStockThreshold} />

        {/* ── Charts ── */}
        <DashboardCharts chartData={chartData} />

        {/* ── Store Summary ── */}
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

        {/* ── Recently Added Products ── */}
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
