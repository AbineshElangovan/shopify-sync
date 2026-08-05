"use client";

import React, { useState, useEffect } from 'react';
import { Card, Table, Badge, SearchBar, Filter, Pagination, EmptyState, StatCard } from '@/components/common';
import { LocalizedDate } from '@/components/common/LocalizedDate';
import { CheckCircleIcon, AlertTriangleIcon, ProductIcon } from '@shopify/polaris-icons';
import { shopifyFetch } from '@/lib/shopify/Client';
import { StoreRoleBadge } from '@/components/ui/StoreRoleBadge';

export default function SyncPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  
  // A helper to avoid rapid firing on search
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 500);
    return () => clearTimeout(handler);
  }, [search]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '10',
        status: statusFilter,
        ...(debouncedSearch && { search: debouncedSearch }),
      });
      const res = await shopifyFetch(`/api/sync?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [page, statusFilter, debouncedSearch]);

  const handleStatusChange = (newStatus: string) => {
    setStatusFilter(newStatus);
    setPage(1);
  };

  return (
    <div className="p-8 max-w-7xl mx-auto mb-16">
      <div className="mb-6 border-b border-gray-200 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 400, color: '#111827', margin: 0, letterSpacing: '-0.025em' }}>
            Inventory Synchronization Dashboard
          </h1>
          <p style={{ fontSize: '0.8rem', color: '#4b5563', margin: 0, marginTop: '8px' }}>
            Monitor your cross-store product replication and automated inventory syncing.
          </p>
        </div>
        <div>
          <StoreRoleBadge />
        </div>
      </div>

      {/* Stats Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <StatCard
          label="Total Syncs"
          description="All inventory replications triggered"
          value={data?.stats?.total?.toString() || (loading ? '...' : '0')}
          gradient="linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)"
          icon={ProductIcon}
        />
        <StatCard
          label="Successful Syncs"
          description="Replications completed successfully"
          value={data?.stats?.success?.toString() || (loading ? '...' : '0')}
          gradient="linear-gradient(135deg, #15803d 0%, #22c55e 100%)"
          icon={CheckCircleIcon}
        />
        <StatCard
          label="Failed Syncs"
          description="Replications that encountered errors"
          value={data?.stats?.failed?.toString() || (loading ? '...' : '0')}
          gradient="linear-gradient(135deg, #c2410c 0%, #f97316 100%)"
          icon={AlertTriangleIcon}
        />
      </div>

      <Card>
        <div className="overflow-x-auto w-full max-w-full">
          <Table 
            title="Synchronization Logs"
            serverSide={true}
            paginate={true}
            page={page}
            totalPages={data?.pagination?.totalPages ?? 1}
            totalItems={data?.pagination?.total ?? 0}
            onPageChange={(p) => setPage(p)}
            searchable={true}
            searchValue={search}
            onSearchChange={(val) => setSearch(val)}
            filterable={true}
            filterKey="status"
            filterValue={statusFilter}
            onFilterChange={(val) => handleStatusChange(val)}
            filterOptions={[
              { label: 'All Statuses', value: 'ALL' },
              { label: 'Success', value: 'SUCCESS' },
              { label: 'Failed', value: 'FAILED' },
              { label: 'Pending', value: 'PENDING' }
            ]}
            loading={loading}
            headerColor="#7c3aed"
            columns={[
              { title: 'Date', key: 'date' },
              { title: 'Type', key: 'type' },
              { title: 'SKU', key: 'sku' },
              { title: 'Source', key: 'source' },
              { title: 'Target', key: 'target' },
              { title: 'Duration (ms)', key: 'duration' },
              { title: 'Retries', key: 'retries' },
              { title: 'Status', key: 'status', type: 'status', badgeRules: { 'SUCCESS': 'success', 'FAILED': 'critical', 'PENDING': 'warning', 'RETRYING': 'warning' } }
            ]}
            items={(data?.logs || []).map((log: any) => ({
              id: log.id,
              date: <LocalizedDate date={log.createdAt} format="datetime" />,
              type: log.syncType || 'UNKNOWN',
              sku: log.sku || '-',
              source: log.sourceStore?.label || log.sourceStore?.shopDomain || 'Unknown',
              target: log.destinationStore?.label || log.destinationStore?.shopDomain || 'Unknown',
              duration: log.durationMs ? `${log.durationMs}ms` : '-',
              retries: log.retryCount > 0 ? log.retryCount : '-',
              status: log.status === 'SUCCESS' && log.retryCount > 0 
                      ? `SUCCESS (after ${log.retryCount} retries)`
                      : log.status,
              _subtitle: log.errorMessage ? `Error: [${log.errorCode || 'ERR'}] ${log.errorMessage}` : (log.requestId ? `Request ID: ${log.requestId}` : undefined)
            }))}
            emptyState={
              <EmptyState 
                heading="No synchronization logs found"
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>Try adjusting your filters or search query.</p>
              </EmptyState>
            }
          />
        </div>
      </Card>
    </div>
  );
}
