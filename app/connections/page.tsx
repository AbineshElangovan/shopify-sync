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
import { useRouter } from 'next/navigation';
import { LocalizedDate } from '@/components/common/LocalizedDate';
import { Icon } from '@shopify/polaris';
import { DeleteIcon, AlertTriangleIcon } from '@shopify/polaris-icons';
import { TableCard } from '@/components/ui/TableCard';
import { ThemedSection } from '@/components/ui/ThemedSection';
import { StoreRoleBadge } from '@/components/ui/StoreRoleBadge';


export default function ConnectionsPage() {
  const [installedStores, setInstalledStores] = useState<any[]>([]);
  const [connections, setConnections] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [masterProductCount, setMasterProductCount] = useState<number>(0);
  const [storeData, setStoreData] = useState<any>(null);

  function timeAgo(dateString: string | Date | undefined) {
    if (!dateString) return 'Never';
    const now = new Date();
    const past = new Date(dateString);
    const diffInSeconds = Math.floor((now.getTime() - past.getTime()) / 1000);
    if (diffInSeconds < 60) return `${diffInSeconds} seconds ago`;
    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) return `${diffInMinutes} minutes ago`;
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours} hours ago`;
    return `${Math.floor(diffInHours / 24)} days ago`;
  }

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
        if (data.masterProductCount !== undefined) setMasterProductCount(data.masterProductCount);
        if (data.store) {
          setStoreData(data.store);
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
        setToastMessage({ message: 'Store connected successfully! Starting initial sync...', type: 'success' });
        setStoreIdInput('');
        fetchData();
        
        // Auto-trigger sync
        setSyncing(true);
        try {
          await shopifyFetch('/api/sync/manual', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ selectedTargetStoreIds: [data.connection.targetStoreId] })
          });
        } catch (e) {
          console.error('Initial sync error:', e);
        } finally {
          setSyncing(false);
        }
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
    installedAt: <LocalizedDate date={s.installedAt} format="date" />,
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
    <div className="p-8 max-w-6xl mx-auto mb-16">
      <div className="flex justify-between items-start mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Store connections</h1>
          <p className="text-slate-500 mt-1">One master, unlimited connected stores</p>
        </div>
        <div className="flex items-center gap-4">
          <StoreRoleBadge />
        </div>
      </div>

      {!isMaster && currentStoreUniqueId && (
        <div className="mb-8 p-6 bg-white border border-primary-200 rounded-2xl shadow-sm text-center">
          <h2 className="text-lg font-semibold text-slate-900 mb-2">Connect to a Master Store</h2>
          <p className="text-slate-500 mb-4">Provide this Unique Store ID to your Master Store administrator to link this catalog.</p>
          <div className="inline-flex items-center gap-3 bg-slate-50 border border-slate-200 px-4 py-2 rounded-lg">
            <span className="font-mono text-lg text-primary-DEFAULT font-bold">{currentStoreUniqueId}</span>
            <button 
              onClick={() => { navigator.clipboard.writeText(currentStoreUniqueId); setToastMessage({ message: 'Copied!', type: 'success' }); }}
              className="text-slate-400 hover:text-primary-DEFAULT transition-colors"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          
          {/* Render Master Store */}
          {installedStores.filter(s => s.isMaster || s.id === installedStores.find(i=>i.isMaster)?.id).map(master => {
            const currency = 'INR';
            const region = 'India';
            const plan = '-';
            const productCount = storeData?.productCount || 0;
            const lastSync = master.updatedAt || storeData?.updatedAt;

            return (
             <div key="master" className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 flex flex-col">
           <div className="flex justify-between items-start mb-4">
             <div>
               <h3 className="font-semibold text-lg flex items-center gap-2 text-slate-900">
                 {master.label || master.shopDomain.split('.')[0]}
                 <span className="bg-[var(--color-primary-light)] text-[var(--color-primary-dark)] px-2 py-0.5 rounded-full text-xs font-semibold flex items-center gap-1 border border-[var(--color-primary)]">
                   <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M2 22h20v-2H2v2zm9-5l5-4 4 4V5c0-1.1-.9-2-2-2H6c-1.1 0-2 .9-2 2v12l4-4 5 4z"/></svg>
                   Master
                 </span>
               </h3>
               <p className="text-slate-500 text-base mt-0.5">{master.shopDomain}</p>
             </div>
             <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${master.isActive ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
               {master.isActive ? 'healthy' : 'stale'}
             </span>
           </div>
 
           <div className="grid grid-cols-2 gap-y-4 gap-x-2 text-sm mb-4 mt-6">
              <div>
                <p className="text-slate-500 mb-0.5 text-xs">Currency</p>
                <p className="font-medium text-slate-900">{currency}</p>
              </div>
              <div>
                <p className="text-slate-500 mb-0.5 text-xs">Region</p>
                <p className="font-medium text-slate-900">{region}</p>
              </div>
              <div>
                <p className="text-slate-500 mb-0.5 text-xs">Plan</p>
                <p className="font-medium text-slate-900">{plan}</p>
              </div>
              <div>
                <p className="text-slate-500 mb-0.5 text-xs">Last sync</p>
                <p className="font-medium text-slate-900">{timeAgo(lastSync)}</p>
              </div>
            </div>


          </div>
        )})}

        {/* Render Target Stores as Cards */}
        {connections
          .filter(conn => {
            const masterId = installedStores.find(i => i.isMaster)?.id;
            return conn.targetStore.id !== masterId;
          })
          .map((conn) => {
          const store = conn.targetStore;
          const currency = 'INR';
          const region = 'India';
          const plan = '-';
          const productCount = store.productCount || 0;
          const lastSync = conn.lastSyncTime;
          
          const coveragePercent = masterProductCount > 0 
            ? Math.round((productCount / masterProductCount) * 100) 
            : 0;

          return (
            <div key={conn.targetStoreId} className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 flex flex-col">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="font-semibold text-lg flex items-center gap-2 text-slate-900">
                    {store.label || store.shopDomain.split('.')[0]}
                    {conn.direction === 'incoming' && (
                      <span className="bg-[var(--color-primary-light)] text-[var(--color-primary-dark)] px-2 py-0.5 rounded-full text-xs font-semibold flex items-center gap-1 border border-[var(--color-primary)]">
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 22h20M2 18l4-10 4 6 2-8 2 8 4-6 4 10H2z"/></svg>
                        Master
                      </span>
                    )}
                  </h3>
                  <div className="mt-1 flex flex-col gap-0.5">
                    <p className="text-slate-700 text-base font-medium">{store.uniqueStoreId || 'N/A'}</p>
                    <p className="text-slate-500 text-sm">https://{store.shopDomain}</p>
                  </div>
                </div>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${store.isActive ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                  {store.isActive ? 'healthy' : 'stale'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-y-4 gap-x-2 text-sm mb-4 mt-6">
                <div>
                  <p className="text-slate-500 mb-0.5 text-xs">Currency</p>
                  <p className="font-medium text-slate-900">{currency}</p>
                </div>
                <div>
                  <p className="text-slate-500 mb-0.5 text-xs">Region</p>
                  <p className="font-medium text-slate-900">{region}</p>
                </div>
                <div>
                  <p className="text-slate-500 mb-0.5 text-xs">Plan</p>
                  <p className="font-medium text-slate-900">{plan}</p>
                </div>
                <div>
                  <p className="text-slate-500 mb-0.5 text-xs">Last sync</p>
                  <p className="font-medium text-slate-900">{timeAgo(lastSync)}</p>
                </div>
              </div>


            </div>
          )
        })}
      </div>





      {isMaster && (
        <div className="bg-white rounded-2xl border-2 border-dashed border-slate-200 p-8 shadow-sm mb-6 flex flex-col md:flex-row items-center gap-6 hover:border-slate-300 transition-colors">
          <div className="w-12 h-12 bg-primary-50 rounded-full flex items-center justify-center text-primary-DEFAULT shrink-0">
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-lg text-slate-900 mb-1">Pair New Store</h3>
            <p className="text-slate-500 text-sm">Enter the Unique Store ID of the destination store to establish a connection.</p>
          </div>
          <div className="flex w-full md:w-auto gap-3 shrink-0">
            <input 
              type="text" 
              placeholder="e.g. STORE-XYZ123" 
              className="ys-input min-w-[250px]"
              value={storeIdInput}
              onChange={(e) => setStoreIdInput(e.target.value)}
            />
            <button 
              className="px-4 py-2 bg-[var(--color-primary-dark)] text-white text-sm font-semibold rounded-lg hover:bg-[var(--color-primary)] transition-colors shadow-sm whitespace-nowrap"
              onClick={handleAddStore}
              disabled={connecting || !storeIdInput.trim()}
            >
              {connecting ? 'Connecting...' : 'Connect Store'}
            </button>
          </div>
        </div>
      )}





      {/* Target Stores Table (For Master Store) */}
      {isMaster && connections.filter(c => c.direction === 'outgoing').length > 0 && (
        <div className="mb-8 w-full overflow-hidden">
          <TableCard title="Connected Stores">
            <div className="overflow-x-auto w-full max-w-full">
              <Table 
                headerColor="var(--color-primary-dark)"
                columns={[
                  { title: 'Store Name', key: 'name', type: 'bold' },
                  { title: 'Store URL', key: 'url' },
                  { title: 'Status', key: 'status', type: 'badge', badgeRules: { 'Healthy': 'success', 'Stale': 'warning' } },
                  { title: 'Action', key: 'action', type: 'react_node' }
                ]}
                items={connections.filter(c => c.direction === 'outgoing').map(conn => ({
                  name: conn.targetStore.label || conn.targetStore.shopDomain.split('.')[0],
                  url: `https://${conn.targetStore.shopDomain}`,
                  status: conn.targetStore.isActive ? 'Healthy' : 'Stale',
                  action: (
                    <button 
                      onClick={() => handleRemoveStore(conn.targetStoreId)} 
                      className="text-red-600 hover:text-red-700 font-semibold px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 transition-colors flex items-center gap-1.5 text-xs w-fit"
                      title="Remove Connection"
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                      </svg>
                      Remove
                    </button>
                  )
                }))}
              />
            </div>
          </TableCard>
        </div>
      )}

      {isMaster && connections.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm mb-8">
          <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="font-bold text-xl text-slate-900 mb-1">Manual Synchronization</h2>
              <p className="text-slate-500 text-sm">Select destination stores to force an immediate catalog push.</p>
            </div>
          </div>
          
          <div className="bg-slate-50 border border-slate-100 rounded-xl p-5 mb-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {connections.map((conn) => (
                <label key={conn.targetStoreId} className="flex items-center gap-3 cursor-pointer bg-white border border-slate-200 rounded-lg p-3 shadow-sm hover:border-primary-300 transition-colors">
                  <input 
                    type="checkbox"
                    className="w-4 h-4 text-primary-DEFAULT rounded border-gray-300 focus:ring-primary-DEFAULT cursor-pointer"
                    checked={selectedStores.includes(conn.targetStoreId)}
                    onChange={() => handleToggleSyncSelection(conn.targetStoreId)}
                  />
                  <span className="text-sm font-medium text-slate-700 truncate" title={conn.targetStore.label || conn.targetStore.shopDomain}>{conn.targetStore.label || conn.targetStore.shopDomain.split('.')[0]}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex gap-3 mt-4">
            <button
              onClick={handleSelectAllSync}
              className="px-4 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors shadow-sm"
            >
              {selectedStores.length === connections.length ? 'Deselect All' : 'Select All'}
            </button>
            <button
              onClick={handleSync}
              disabled={selectedStores.length === 0 || syncing}
              className="px-6 py-2 bg-[var(--color-primary-dark)] text-white text-sm font-semibold rounded-lg hover:bg-[var(--color-primary)] transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 w-full md:w-auto justify-center"
            >
              {syncing ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                  Syncing...
                </>
              ) : 'Sync Selected Stores'}
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <h2 className="font-bold text-lg text-slate-900 mb-4">Master store behaviour</h2>
        <p className="text-slate-500 text-sm mb-6">What happens when the source of truth is unavailable</p>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-5 border border-slate-100 rounded-xl bg-slate-50">
            <h4 className="font-bold text-slate-900 mb-2">Cached snapshot</h4>
            <p className="text-slate-500 text-sm">Connected stores keep selling from the last known good inventory, flagged as stale in the header.</p>
          </div>
          <div className="p-5 border border-slate-100 rounded-xl bg-slate-50">
            <h4 className="font-bold text-slate-900 mb-2">Queued writes</h4>
            <p className="text-slate-500 text-sm">Orders placed during an outage are queued and replayed in order once master returns.</p>
          </div>
          <div className="p-5 border border-slate-100 rounded-xl bg-slate-50">
            <h4 className="font-bold text-slate-900 mb-2">Failover promotion</h4>
            <p className="text-slate-500 text-sm">If master is offline beyond your threshold, you can temporarily promote another store.</p>
          </div>
        </div>
      </div>

      {toastMessage && (
        <div className={`fixed bottom-6 right-6 px-6 py-3 rounded-lg shadow-lg flex items-center gap-3 text-sm font-medium z-50 text-white ${toastMessage.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>
          {toastMessage.message}
          <button onClick={() => setToastMessage(null)} className="ml-2 opacity-80 hover:opacity-100">✕</button>
        </div>
      )}
    </div>
  );
}
