import { prisma } from '@/lib/db/prisma';
import { Table, ColumnConfig } from '@/components/common/Table';
import { BlockStack } from '@shopify/polaris';
import { cleanupSeededData, hasValidShopifyAccessToken, syncStoreProducts, verifyStoreInstallation } from '@/services/shopify';

export const dynamic = 'force-dynamic';

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ shop?: string; host?: string }>;
}) {
  const params = await searchParams;
  await verifyStoreInstallation(params.shop, params.host);
  await cleanupSeededData();

  const activeStores = await prisma.store.findMany({ where: { isActive: true } });
  const validStores = activeStores.filter((store) => hasValidShopifyAccessToken(store.accessToken));

  await Promise.allSettled(
    validStores.map((store) => syncStoreProducts(store.shopDomain))
  );

  const validStoreIds = validStores.map((store) => store.id);
  const productCacheWhere = validStoreIds.length > 0 ? { storeId: { in: validStoreIds } } : { id: { in: [] } };

  // Fetch all products with store info
  const products = await prisma.productCache.findMany({
    where: productCacheWhere,
    orderBy: { updatedAt: 'desc' },
    include: { store: true },
  });

  const totalProducts  = products.length;
  const totalInventory = products.reduce((sum, p) => sum + p.inventoryQuantity, 0);
  const activeProducts = products.filter((p) => p.inventoryQuantity > 0).length;
  const lowStock       = products.filter((p) => p.inventoryQuantity <= 15).length;

  const tableItems = products.map((p) => ({
    id: p.id,
    imageUrl: p.imageUrl,
    title: p.title,
    sku: p.sku || 'N/A',
    store: p.store?.label || p.store?.shopDomain || 'Unknown',
    inventoryQuantity: p.inventoryQuantity,
    stockLevel:
      p.inventoryQuantity === 0
        ? 'Out of Stock'
        : p.inventoryQuantity <= 5
        ? 'Critical'
        : p.inventoryQuantity <= 15
        ? 'Low'
        : 'Healthy',
    status: p.inventoryQuantity > 0 ? 'Active' : 'Inactive',
    updatedDate: p.updatedAt.toLocaleDateString(),
    updatedTime: p.updatedAt.toLocaleTimeString(),
  }));

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
    { label: 'Total Products',  value: totalProducts,  color: '#6366f1', bg: '#eef2ff' },
    { label: 'Active Products', value: activeProducts, color: '#16a34a', bg: '#f0fdf4' },
    { label: 'Total Inventory', value: totalInventory, color: '#0891b2', bg: '#ecfeff' },
    { label: 'Low / Critical',  value: lowStock,       color: '#ea580c', bg: '#fff7ed' },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <BlockStack gap="800">

        {/* ── Page Heading ── */}
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827', margin: 0 }}>
            Products
          </h1>
          <p style={{ marginTop: 4, color: '#6b7280', fontSize: '0.875rem' }}>
            All products synced across your connected Shopify stores
          </p>
        </div>

        {/* ── Stat Cards ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
          {STAT_CARDS.map(({ label, value, color, bg }) => (
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
                {value.toLocaleString()}
              </p>
            </div>
          ))}
        </div>

        {/* ── Products Table ── */}
        <Table
          title="All Products"
          headerColor="#6366f1"
          columns={columns}
          items={tableItems}
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
              No products found. Connect a Shopify store to start syncing.
            </div>
          }
        />

      </BlockStack>
    </div>
  );
}
