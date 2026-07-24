'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { Card, Table } from '@/components/common';
import { 
  TextField, 
  Button, 
  Badge, 
  Checkbox, 
  Text,
  BlockStack,
  InlineStack,
  Box,
  Divider,
  Icon,
} from '@shopify/polaris';
import { DeleteIcon, StoreIcon } from '@shopify/polaris-icons';
import { authenticatedFetch } from '@shopify/app-bridge/utilities';

export default function ManualSyncWidget() {
  const [connections, setConnections] = useState<any[]>([]);
  const [selectedStores, setSelectedStores] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  
  // UI State
  const [storeIdInput, setStoreIdInput] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [currentStoreUniqueId, setCurrentStoreUniqueId] = useState('');
  
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
    fetchConnections();
  }, []);

  const fetchConnections = async () => {
    try {
      setLoading(true);
      const app = (window as any).shopifyApp;
      if (!app) return;
      const fetchAuth = authenticatedFetch(app);
      const res = await fetchAuth('/api/connections');
      const data = await res.json();
      if (data.success) {
        setConnections(data.connections || []);
        if (data.store && data.store.uniqueStoreId) {
          setCurrentStoreUniqueId(data.store.uniqueStoreId);
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
      const app = (window as any).shopifyApp;
      if (!app) throw new Error("Shopify App Bridge not initialized");
      const fetchAuth = authenticatedFetch(app);
      const res = await fetchAuth('/api/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uniqueStoreId: storeIdInput.trim() })
      });
      const data = await res.json();
      
      if (data.success) {
        setToastMessage({ message: 'Store connected successfully!', type: 'success' });
        setStoreIdInput('');
        fetchConnections(); // Refresh list
      } else {
        setToastMessage({ message: data.error || 'Failed to connect store.', type: 'error' });
      }
    } catch (err: any) {
      setToastMessage({ message: err.message, type: 'error' });
    } finally {
      setConnecting(false);
    }
  };

  const handleRemoveStore = async (targetStoreId: string) => {
    if (!confirm('Are you sure you want to remove this connection?')) return;
    
    try {
      const app = (window as any).shopifyApp;
      if (!app) throw new Error("Shopify App Bridge not initialized");
      const fetchAuth = authenticatedFetch(app);
      const res = await fetchAuth(`/api/connections?targetStoreId=${targetStoreId}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        setToastMessage({ message: 'Store connection removed successfully.', type: 'success' });
        fetchConnections();
        setSelectedStores(prev => prev.filter(id => id !== targetStoreId));
      } else {
        setToastMessage({ message: 'Failed to remove: ' + data.error, type: 'error' });
      }
    } catch (err: any) {
      setToastMessage({ message: 'Error: ' + err.message, type: 'error' });
    }
  };

  const handleToggle = (storeId: string) => {
    setSelectedStores(prev => 
      prev.includes(storeId) 
        ? prev.filter(id => id !== storeId)
        : [...prev, storeId]
    );
  };
  
  const handleSelectAll = () => {
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
      setToastMessage({ message: 'Sync initiated in the background. You can monitor the logs below.', type: 'success' });
      
      const app = (window as any).shopifyApp;
      if (!app) throw new Error("Shopify App Bridge not initialized");
      const fetchAuth = authenticatedFetch(app);
      const res = await fetchAuth('/api/sync/manual', {
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

  if (loading && connections.length === 0) {
    return <div className="text-sm text-gray-500 mb-8">Loading StoreBridge configurations...</div>;
  }

  const tableColumns = [
    { title: 'Store Name', key: 'name', type: 'bold' as const },
    { title: 'Store ID', key: 'storeId' },
    { title: 'Status', key: 'status', type: 'status' as const, badgeRules: { 'Connected': 'success' as const } },
    { title: 'Action', key: 'action' }
  ];

  const tableItems = connections.map(conn => ({
    id: conn.targetStoreId,
    name: conn.targetStore.label || conn.targetStore.shopDomain,
    storeId: conn.targetStore.uniqueStoreId,
    status: 'Connected',
    action: (
      <button 
        onClick={() => handleRemoveStore(conn.targetStoreId)}
        className="text-red-600 hover:text-red-800 font-medium text-xs transition-colors cursor-pointer bg-transparent border-none p-0"
      >
        Remove
      </button>
    )
  }));

  return (
    <div className="mb-8 flex flex-col gap-6">
      <Card>
        <div className="p-6">
          <BlockStack gap="400">
            <Text variant="headingLg" as="h2">Store Connection</Text>
            <Text variant="bodyMd" as="p">
              Connect destination stores by entering their Unique Store ID.
              {currentStoreUniqueId && (
                <span className="block mt-2">
                  Your Unique Store ID: <strong className="bg-gray-100 px-2 py-1 rounded text-indigo-700">{currentStoreUniqueId}</strong>
                </span>
              )}
            </Text>

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
          </BlockStack>
          
          <div className="mt-8">
            <Divider />
          </div>

          <BlockStack gap="400">
            <div className="mt-6">
              <Text variant="headingLg" as="h2">Connected Stores</Text>
            </div>
            
            {connections.length === 0 ? (
              <div style={{ padding: '16px', backgroundColor: '#fffbeb', border: '1px solid #fef3c7', borderRadius: '8px', color: '#92400e' }}>
                <p style={{ margin: 0 }}>No connected stores found. Add a store using its Unique Store ID above to begin synchronization.</p>
              </div>
            ) : (
              <Table 
                columns={tableColumns} 
                items={tableItems} 
                searchable={false}
                filterable={false}
                paginate={false}
                headerColor="#4f46e5"
              />
            )}
          </BlockStack>
        </div>
      </Card>
      
      <Card>
        <div className="p-6">
          <BlockStack gap="400">
            <Text variant="headingLg" as="h2">Manual Synchronization</Text>
            <Text variant="bodyMd" as="p">
              Select connected stores to manually force a full catalog sync (products, inventory, prices, collections).
            </Text>

            {connections.length === 0 ? (
              <div style={{ padding: '16px', backgroundColor: '#fffbeb', border: '1px solid #fef3c7', borderRadius: '8px', color: '#92400e' }}>
                <p style={{ margin: 0 }}>You must connect at least one store before you can run a manual synchronization.</p>
              </div>
            ) : (
              <BlockStack gap="400">
                <Box borderColor="border" borderWidth="025" borderRadius="200" padding="400">
                  <BlockStack gap="300">
                    {connections.map((conn) => (
                      <Checkbox
                        key={conn.targetStoreId}
                        label={conn.targetStore.label || conn.targetStore.shopDomain}
                        checked={selectedStores.includes(conn.targetStoreId)}
                        onChange={() => handleToggle(conn.targetStoreId)}
                      />
                    ))}
                  </BlockStack>
                </Box>
                
                <InlineStack gap="300">
                  <Button onClick={handleSelectAll}>
                    {selectedStores.length === connections.length ? 'Deselect All' : 'Select All'}
                  </Button>
                  <Button 
                    variant="primary" 
                    onClick={handleSync}
                    disabled={selectedStores.length === 0 || syncing}
                    loading={syncing}
                  >
                    Sync Selected Stores
                  </Button>
                </InlineStack>
              </BlockStack>
            )}
          </BlockStack>
        </div>
      </Card>
      
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
