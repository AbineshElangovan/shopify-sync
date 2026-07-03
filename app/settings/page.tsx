import { prisma } from '@/lib/db/prisma';
import { Card, Table, Badge } from '@/components/common';
import { BlockStack, Layout } from '@shopify/polaris';
import { hasValidShopifyAccessToken, verifyStoreInstallation } from '@/services/shopify';

export const dynamic = 'force-dynamic';

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ shop?: string; host?: string }>;
}) {
  const params = await searchParams;
  await verifyStoreInstallation(params.shop, params.host);
  const stores = await prisma.store.findMany();

  const formattedStores = stores.map((s) => ({
    id: s.id,
    domain: s.shopDomain,
    label: s.label || s.shopDomain,
    status: s.isActive && hasValidShopifyAccessToken(s.accessToken) ? 'CONNECTED' : 'DISCONNECTED',
    installedAt: new Date(s.installedAt).toLocaleDateString(),
  }));

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <BlockStack gap="800">
        {/* Page Heading */}
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827', margin: 0 }}>
            Settings
          </h1>
          <p style={{ marginTop: '4px', color: '#6b7280', fontSize: '0.875rem' }}>
            Manage your stores, synchronization parameters, and system credentials
          </p>
        </div>

        <Layout>
          {/* Store Connection Status Card */}
          <Layout.Section>
            <Table
              title="🔌 Connected Store Channels"
              headerColor="#4338ca"
              columns={[
                { title: 'Store Label', key: 'label', type: 'bold' },
                { title: 'Shopify Domain', key: 'domain' },
                { title: 'Installed On', key: 'installedAt' },
                {
                  title: 'Connection State',
                  key: 'status',
                  type: 'status',
                  badgeRules: { CONNECTED: 'success', DISCONNECTED: 'critical' },
                },
              ]}
              items={formattedStores}
              paginate={false}
              searchable={false}
              filterable={false}
              emptyState={
                <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>
                  No connected store records found. Visit the Partner Dashboard to register this app.
                </div>
              }
            />
          </Layout.Section>

          {/* Sync Preferences & Parameters */}
          <Layout.Section variant="oneThird">
            <Card>
              <h2 className="text-lg font-bold mb-4">⚙️ Sync Rules</h2>
              <div className="flex flex-col gap-4 text-sm text-gray-600">
                <div className="flex justify-between border-b pb-2">
                  <span>Inventory Matching</span>
                  <strong className="text-gray-900">By SKU</strong>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <span>Low Stock Alert Limit</span>
                  <strong className="text-gray-900">15 units</strong>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <span>Auto-sync Webhooks</span>
                  <strong className="text-green-600 font-semibold">Enabled</strong>
                </div>
                <div className="flex justify-between pb-2">
                  <span>Bidirectional Sync</span>
                  <strong className="text-green-600 font-semibold">Enabled</strong>
                </div>
              </div>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </div>
  );
}
