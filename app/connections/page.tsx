"use client";
import React, { useState, useEffect } from 'react';
import { Table } from '@/components/common';
import {
  TextField,
  Button,
  BlockStack,
  InlineStack,
  Box,
  Divider,
  Layout
} from '@shopify/polaris';
import { Checkbox } from '@/components/forms';
import { shopifyFetch } from '@/lib/shopify/Client';
import { Icon } from '@shopify/polaris';
import { DeleteIcon, AlertTriangleIcon } from '@shopify/polaris-icons';

const ThemedSection = ({
  title,
  description,
  bgColor,
  borderColor,
  stripeColor,
  titleColor,
  descColor,
  children
}: {
  title: string;
  description?: string;
  bgColor: string;
  borderColor: string;
  stripeColor: string;
  titleColor: string;
  descColor?: string;
  children: React.ReactNode;
}) => (
  <div style={{ backgroundColor: bgColor, border: `1px solid ${borderColor}`, borderRadius: '12px', padding: '24px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
    <div style={{ marginBottom: '20px', borderLeft: `4px solid ${stripeColor}`, paddingLeft: '12px' }}>
      <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: titleColor, margin: 0 }}>
        {title}
      </h2>
      {description && (
        <p style={{ marginTop: '4px', color: descColor, fontSize: '0.875rem' }}>
          {description}
        </p>
      )}
    </div>
    {children}
  </div>
);

export default function ConnectionsPage() {
  const [installedStores, setInstalledStores] = useState<any[]>([]);
  const [connections, setConnections] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Store Pairing State
  const [storeIdInput, setStoreIdInput] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [currentStoreUniqueId, setCurrentStoreUniqueId] = useState('');
  const [isMaster, setIsMaster] = useState(false);

  // Manual Sync State
  const [syncing, setSyncing] = useState(false);
  const [selectedStores, setSelectedStores] = useState<string[]>([]);

  // Manual Store Generation State
  const [generatingStore, setGeneratingStore] = useState(false);

  const [toastMessage, setToastMessage] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => {
        setToastMessage(null);
      }, 15000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);

      const [storesRes, connectionsRes] = await Promise.all([
        shopifyFetch('/api/stores?active=false', { cache: 'no-store' }),
        shopifyFetch('/api/connections', { cache: 'no-store' })
      ]);

      if (storesRes.ok) {
        const storesJson = await storesRes.json();
        setInstalledStores(storesJson.stores || []);
      }

      const data = await connectionsRes.json();
      if (data.success) {
        setConnections(data.connections || []);
        if (data.store) {
          if (data.store.uniqueStoreId) {
            setCurrentStoreUniqueId(data.store.uniqueStoreId);
          }
          if (data.store.isMaster !== undefined) {
            setIsMaster(data.store.isMaster);
          }
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddStore = async () => {
    if (!storeIdInput.trim()) return;
    setConnecting(true);
    setToastMessage(null);

    try {
      const res = await shopifyFetch('/api/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uniqueStoreId: storeIdInput.trim() })
      });
      const data = await res.json();

      if (data.success) {
        setToastMessage({ message: 'Store connected successfully!', type: 'success' });
        setStoreIdInput('');
        fetchData();
      } else {
        setToastMessage({ message: data.error || 'Failed to connect store.', type: 'error' });
      }
    } catch (err: any) {
      setToastMessage({ message: err.message, type: 'error' });
    } finally {
      setConnecting(false);
    }
  };

  const handleGenerateManualStore = async () => {
    setGeneratingStore(true);
    setToastMessage(null);
    try {
      const res = await shopifyFetch('/api/stores/manual', {
        method: 'POST',
      });
      const data = await res.json();

      if (data.success) {
        setToastMessage({ message: `Manual store generated! Unique ID: ${data.store.uniqueStoreId}`, type: 'success' });
        // Automatically paste it in the input to make it easy for them
        setStoreIdInput(data.store.uniqueStoreId);
        fetchData();
      } else {
        setToastMessage({ message: 'Failed to generate store: ' + data.error, type: 'error' });
      }
    } catch (err: any) {
      setToastMessage({ message: 'Error: ' + err.message, type: 'error' });
    } finally {
      setGeneratingStore(false);
    }
  };

  const handleRemoveStore = async (targetStoreId: string) => {
    if (!confirm('Are you sure you want to remove this connection?')) return;
    try {
      const res = await shopifyFetch(`/api/connections?targetStoreId=${targetStoreId}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        setToastMessage({ message: 'Store connection removed successfully.', type: 'success' });
        fetchData();
      } else {
        setToastMessage({ message: 'Failed to remove: ' + data.error, type: 'error' });
      }
    } catch (err: any) {
      setToastMessage({ message: 'Error: ' + err.message, type: 'error' });
    }
  };

  const handleToggleSyncSelection = (storeId: string) => {
    setSelectedStores(prev =>
      prev.includes(storeId)
        ? prev.filter(id => id !== storeId)
        : [...prev, storeId]
    );
  };

  const handleSelectAllSync = () => {
    if (selectedStores.length === connections.length) {
      setSelectedStores([]);
    } else {
      setSelectedStores(connections.map(c => c.targetStoreId));
    }
  };

  const handleSync = async () => {
    if (selectedStores.length === 0) return;
    try {
      setSyncing(true);
      setToastMessage({ message: 'Sync initiated in the background. Check the Sync logs for progress.', type: 'success' });

      const res = await shopifyFetch('/api/sync/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selectedTargetStoreIds: selectedStores })
      });

      const data = await res.json();
      if (!data.success) {
        setToastMessage({ message: 'Error starting sync: ' + data.error, type: 'error' });
      }
    } catch (err: any) {
      setToastMessage({ message: 'Error starting sync: ' + err.message, type: 'error' });
    } finally {
      setSyncing(false);
    }
  };

  const formattedInstalledStores = installedStores.map((s) => ({
    id: s.id,
    domain: s.shopDomain,
    label: s.label || s.shopDomain,
    status: s.isActive ? 'CONNECTED' : 'DISCONNECTED',
    installedAt: new Date(s.installedAt).toLocaleDateString(),
  }));

  const tableColumns = [
    { title: 'Store Name', key: 'name', type: 'bold' as const },
    { title: 'Store ID', key: 'storeId' },
    { title: 'Status', key: 'status', type: 'status' as const, badgeRules: { 'Connected': 'success' as const, 'Disconnected': 'critical' as const } },
    { title: 'Action', key: 'action' }
  ];

  const tableItems = connections.map(conn => {
    const isInactive = conn.targetStore.isActive === false;

    return {
      id: conn.targetStoreId,
      name: (
        <div className="flex flex-col gap-1">
          <span>{conn.targetStore.label || conn.targetStore.shopDomain}</span>
        </div>
      ),
      storeId: conn.targetStore.uniqueStoreId,
      status: isInactive ? 'Disconnected' : 'Connected',
      action: (
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleRemoveStore(conn.targetStoreId)}
            className="flex items-center gap-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 px-2 py-1.5 rounded transition-colors cursor-pointer bg-transparent border-none font-medium text-xs"
            title="Remove Connection"
          >
            <div style={{ width: '16px', height: '16px' }}>
              <Icon source={DeleteIcon} tone="critical" />
            </div>
            Remove
          </button>
        </div>
      )
    };
  });

  if (loading && connections.length === 0) {
    return (
      <div className="p-8 max-w-7xl mx-auto flex justify-center mt-20">
        <style>{`@keyframes sync-spin{to{transform:rotate(360deg)}}.ys-sync-ring{width:44px;height:44px;border-radius:50%;border:4px solid #e5e7eb;border-top-color:#6366f1;animation:sync-spin 0.75s linear infinite}`}</style>
        <div className="ys-sync-ring" />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto mb-16">
      <h1 className="text-3xl font-bold mb-8">Store Connections Hub</h1>

      <Layout>
        <Layout.Section>
          <BlockStack gap="500">



            {/* Store Pairing Section (Blue/Indigo Theme) */}
            <ThemedSection
              title="Store Pairing"
              description="Establish secure links with destination stores to allow inventory replication."
              bgColor="#eff6ff"
              borderColor="#bfdbfe"
              stripeColor="#3b82f6"
              titleColor="#1e3a8a"
              descColor="#1e40af"
            >
              <BlockStack gap="400">
                {currentStoreUniqueId && (
                  <div className="mb-2 text-sm text-blue-900 flex items-center gap-2">
                    Your Unique Store ID:
                    <strong className="bg-blue-200 px-2 py-1 rounded text-blue-900 shadow-sm">
                      {currentStoreUniqueId}
                    </strong>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(currentStoreUniqueId);
                        setToastMessage({ message: 'Copied to clipboard!', type: 'success' });
                      }}
                      className="ml-2 px-2 py-1 bg-white border border-blue-300 text-blue-700 text-xs rounded hover:bg-blue-50 transition-colors cursor-pointer"
                    >
                      Copy
                    </button>
                  </div>
                )}

                {isMaster && (
                  <>
                    <InlineStack gap="300" blockAlign="start">
                      <Box maxWidth="400px" width="100%">
                        <TextField
                          label="Unique Store ID"
                          labelHidden
                          value={storeIdInput}
                          onChange={setStoreIdInput}
                          placeholder="e.g. ESHAN-3B91C7E4"
                          autoComplete="off"
                        />
                      </Box>
                      <Button
                        variant="primary"
                        onClick={handleAddStore}
                        disabled={connecting || !storeIdInput.trim()}
                        loading={connecting}
                      >
                        + Add Store
                      </Button>
                    </InlineStack>

                    {connections.length === 0 && (
                      <div className="mt-4 pt-4 border-t border-blue-200">
                        <h3 className="font-semibold text-blue-900 mb-2">Create a Manual Store</h3>
                        <p className="text-sm text-blue-800 mb-3">If you need a store ID for an external or manual store that isn't connected via Shopify, you can generate a new one here.</p>
                        <Button
                          variant="primary"
                          onClick={handleGenerateManualStore}
                          loading={generatingStore}
                        >
                          Generate Test Store ID
                        </Button>
                      </div>
                    )}
                  </>
                )}

                <div className="mt-4 pt-4 border-t border-blue-200">
                  <h3 className="font-semibold text-blue-900 mb-4">
                    {isMaster ? 'Connected Destinations' : 'Connected Master Store'}
                  </h3>
                  {connections.length === 0 ? (
                    <div className="p-4 bg-white bg-opacity-60 border border-blue-100 rounded-lg text-blue-800 text-sm">
                      {isMaster
                        ? "No connected stores found. Enter a destination store's Unique Store ID above to pair them."
                        : "This store is not currently connected to a Master store."}
                    </div>
                  ) : (
                    <div className="bg-white rounded-lg shadow-sm overflow-hidden border border-blue-100">
                      <Table
                        columns={tableColumns}
                        items={tableItems}
                        searchable={false}
                        filterable={false}
                        paginate={false}
                        headerColor="#3b82f6"
                      />
                    </div>
                  )}
                </div>
              </BlockStack>
            </ThemedSection>

            {/* Manual Synchronization Section (Emerald/Green Theme) */}
            {isMaster && connections.length > 0 && (
              <ThemedSection
                title="Manual Synchronization"
                description="Force an immediate, full catalog push to your selected destination stores."
                bgColor="#f0fdf4"
                borderColor="#bbf7d0"
                stripeColor="#22c55e"
                titleColor="#14532d"
                descColor="#166534"
              >
                <BlockStack gap="400">
                  <div className="bg-white rounded-lg border border-green-200 p-4 shadow-sm">
                    <h3 className="font-semibold text-green-900 mb-3 text-sm uppercase tracking-wide">Select Targets</h3>
                    <BlockStack gap="300">
                      {connections.map((conn) => (
                        <Checkbox
                          key={conn.targetStoreId}
                          label={conn.targetStore.label || conn.targetStore.shopDomain}
                          checked={selectedStores.includes(conn.targetStoreId)}
                          onChange={() => handleToggleSyncSelection(conn.targetStoreId)}
                        />
                      ))}
                    </BlockStack>
                  </div>

                  <InlineStack gap="300">
                    <button
                      onClick={handleSelectAllSync}
                      className="px-4 py-2 bg-white border border-green-300 text-green-800 font-medium rounded-lg hover:bg-green-50 transition-colors shadow-sm"
                    >
                      {selectedStores.length === connections.length ? 'Deselect All' : 'Select All'}
                    </button>
                    <button
                      onClick={handleSync}
                      disabled={selectedStores.length === 0 || syncing}
                      className={`px-4 py-2 font-medium rounded-lg transition-all shadow-sm ${selectedStores.length === 0 || syncing
                          ? 'bg-green-200 text-green-500 cursor-not-allowed'
                          : 'bg-green-600 text-white hover:bg-green-700'
                        }`}
                    >
                      {syncing ? 'Syncing...' : 'Sync Selected Stores'}
                    </button>
                  </InlineStack>
                </BlockStack>
              </ThemedSection>
            )}

          </BlockStack>
        </Layout.Section>
      </Layout>

      {toastMessage && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            zIndex: 9999,
            backgroundColor: toastMessage.type === 'success' ? '#16a34a' : '#dc2626',
            color: '#ffffff',
            padding: '12px 24px',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '14px',
            fontWeight: 500,
            animation: 'syncToastSlideIn 0.3s ease-out',
            border: '1px solid rgba(255,255,255,0.2)',
          }}
        >
          <style>{`
            @keyframes syncToastSlideIn {
              from { transform: translateY(100px); opacity: 0; }
              to { transform: translateY(0); opacity: 1; }
            }
          `}</style>
          <span>{toastMessage.message}</span>
          <button
            onClick={() => setToastMessage(null)}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#ffffff',
              cursor: 'pointer',
              marginLeft: '12px',
              fontSize: '14px',
              opacity: 0.8,
              lineHeight: 1
            }}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
