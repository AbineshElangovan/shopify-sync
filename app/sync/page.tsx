"use client";

import React, { useState, useEffect } from 'react';
import { Card, Table, Badge, SearchBar, Filter, Pagination, Loading, EmptyState } from '@/components/common';
import { ChoiceList, IndexTable } from '@shopify/polaris';

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
      const res = await fetch(`/api/sync?${params.toString()}`);
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
    <div className="p-8 max-w-7xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">Inventory Synchronization Dashboard</h1>

      {/* Stats Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card>
          <h2 className="font-bold text-gray-700">Total Syncs</h2>
          <p className="text-2xl mt-2">{data?.stats?.total?.toString() || (loading ? '...' : '0')}</p>
        </Card>
        <Card>
          <h2 className="font-bold text-gray-700">Successful Syncs</h2>
          <p className="text-2xl mt-2">{data?.stats?.success?.toString() || (loading ? '...' : '0')}</p>
        </Card>
        <Card>
          <h2 className="font-bold text-gray-700">Failed Syncs</h2>
          <p className="text-2xl mt-2">{data?.stats?.failed?.toString() || (loading ? '...' : '0')}</p>
        </Card>
      </div>

      <div className="flex flex-col md:flex-row justify-between mb-6 gap-4">
        <div className="w-full md:w-1/2">
          <SearchBar 
            label="Search SKU"
            labelHidden
            autoComplete="off"
            value={search} 
            onChange={(val: string) => setSearch(val)} 
            placeholder="Search by SKU..." 
          />
        </div>
        <div className="w-full md:w-1/4">
          <Filter 
            queryValue=""
            filters={[
              {
                key: 'status',
                label: 'Status',
                filter: (
                  <ChoiceList
                    title="Status"
                    titleHidden
                    choices={[
                      { label: 'All', value: 'ALL' },
                      { label: 'Success', value: 'SUCCESS' },
                      { label: 'Failed', value: 'FAILED' },
                      { label: 'Pending', value: 'PENDING' }
                    ]}
                    selected={[statusFilter]}
                    onChange={(val: string[]) => handleStatusChange(val[0])}
                  />
                ),
                shortcut: true,
              }
            ]} 
            appliedFilters={
              statusFilter !== 'ALL' 
                ? [{ key: 'status', label: `Status: ${statusFilter}`, onRemove: () => handleStatusChange('ALL') }] 
                : []
            }
            onQueryChange={() => {}}
            onQueryClear={() => {}}
            onClearAll={() => handleStatusChange('ALL')}
          />
        </div>
      </div>

      <Card>
        <h2 className="text-xl font-bold mb-4">Synchronization Logs</h2>
        {loading ? (
          <div className="flex justify-center p-8"><Loading /></div>
        ) : data?.logs?.length > 0 ? (
          <Table 
            itemCount={data.logs.length}
            headings={[
              { title: 'Date' },
              { title: 'SKU' },
              { title: 'Source Store' },
              { title: 'Target Store' },
              { title: 'Quantity' },
              { title: 'Status' }
            ]}
          >
            {data.logs.map((log: any, index: number) => (
              <IndexTable.Row id={log.id} key={log.id} position={index}>
                <IndexTable.Cell>{new Date(log.createdAt).toLocaleString()}</IndexTable.Cell>
                <IndexTable.Cell>{log.sku}</IndexTable.Cell>
                <IndexTable.Cell>{log.sourceStore?.label || log.sourceStore?.shopDomain || 'Unknown'}</IndexTable.Cell>
                <IndexTable.Cell>{log.destinationStore?.label || log.destinationStore?.shopDomain || 'Unknown'}</IndexTable.Cell>
                <IndexTable.Cell>{`${log.previousQuantity} → ${log.updatedQuantity}`}</IndexTable.Cell>
                <IndexTable.Cell>
                  <Badge tone={log.status === 'SUCCESS' ? 'success' : log.status === 'FAILED' ? 'critical' : 'warning'}>
                    {log.status}
                  </Badge>
                </IndexTable.Cell>
              </IndexTable.Row>
            ))}
          </Table>
        ) : (
          <EmptyState 
            heading="No synchronization logs found"
            image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
          >
            <p>Try adjusting your filters or search query.</p>
          </EmptyState>
        )}
      </Card>

      {data?.pagination?.totalPages > 1 && (
        <div className="mt-6 flex justify-end">
          <Pagination 
            hasPrevious={page > 1}
            onPrevious={() => setPage(page - 1)}
            hasNext={data?.pagination?.totalPages > page}
            onNext={() => setPage(page + 1)}
          />
        </div>
      )}
    </div>
  );
}
