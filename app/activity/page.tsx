"use client";

import { useState, useCallback, useEffect } from "react";
import {
  ResourceList,
  ResourceItem,
  Text,
  Badge,
  TextField,
  BlockStack,
  InlineStack,
  Box,
  Icon,
  Pagination,
  Button,
} from "@shopify/polaris";
import { ProductAddIcon, EditIcon, DeleteIcon, CartIcon, InfoIcon, SearchIcon, ExportIcon } from "@shopify/polaris-icons";
import { shopifyFetch } from "@/lib/shopify/Client";
import { StoreRoleBadge } from '@/components/ui/StoreRoleBadge';
import { Loading, SearchBar, CustomSelect } from '@/components/common';

export default function ActivityPage() {
  const [activities, setActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters state
  const [queryValue, setQueryValue] = useState("");
  const [debouncedQueryValue, setDebouncedQueryValue] = useState("");
  const [collectionFilter, setCollectionFilter] = useState("");
  const [storeFilter, setStoreFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("all");

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQueryValue(queryValue);
      setPage(1); // Reset page when search term changes
    }, 500);
    return () => clearTimeout(handler);
  }, [queryValue]);

  const [collectionOptions, setCollectionOptions] = useState<any[]>([]);
  const [storeOptions, setStoreOptions] = useState<any[]>([]);

  const [isMaster, setIsMaster] = useState(false);
  const [isMultiStore, setIsMultiStore] = useState(false);

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [errorMsg, setErrorMsg] = useState("");
  const [isExporting, setIsExporting] = useState(false);

  const fetchActivities = useCallback(async () => {
    setLoading(true);
    setErrorMsg("");
    try {
      const params = new URLSearchParams();
      if (debouncedQueryValue) params.append("search", debouncedQueryValue);
      if (collectionFilter) params.append("collection", collectionFilter);
      if (storeFilter) params.append("storeId", storeFilter);
      if (dateFilter) params.append("dateRange", dateFilter);
      params.append("page", page.toString());
      params.append("limit", "15");

      const response = await shopifyFetch(`/api/activity?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        setActivities(data.activities || []);
        setIsMaster(data.isMaster || false);
        setIsMultiStore(data.isMultiStore || false);
        setTotalPages(data.pagination?.totalPages || 1);
        setCollectionOptions(data.collectionOptions || []);
        setStoreOptions(data.storeOptions || []);
      } else {
        const errData = await response.json();
        setErrorMsg(errData.error || "Failed to fetch activities");
      }
    } catch (error: any) {
      console.error("Failed to fetch activities:", error);
      setErrorMsg(error.message || "Network error");
    } finally {
      setLoading(false);
    }
  }, [debouncedQueryValue, collectionFilter, storeFilter, dateFilter, page]);

  useEffect(() => {
    fetchActivities();
  }, [fetchActivities]);

  const handleSearchChange = useCallback((value: string) => {
    setQueryValue(value);
  }, []);

  const getEventIcon = (eventType: string) => {
    const wrapIcon = (icon: any, colorClass: string) => (
      <span className={`inline-flex items-center justify-center p-1 rounded-full bg-black shadow-sm ${colorClass}`}>
        {icon}
      </span>
    );

    switch (eventType) {
      case "CREATE": return wrapIcon(<Icon source={ProductAddIcon} tone="inherit" />, "text-green-400");
      case "UPDATE": return wrapIcon(<Icon source={EditIcon} tone="inherit" />, "text-blue-400");
      case "DELETE": return wrapIcon(<Icon source={DeleteIcon} tone="inherit" />, "text-red-500");
      case "SOLD": return wrapIcon(<Icon source={CartIcon} tone="inherit" />, "text-yellow-400");
      default: return wrapIcon(<Icon source={InfoIcon} tone="inherit" />, "text-gray-400");
    }
  };

  const getEventTitle = (eventType: string) => {
    switch (eventType) {
      case "CREATE": return "Product Created";
      case "UPDATE": return "Product Updated";
      case "DELETE": return "Product Deleted";
      case "SOLD": return "Product Sold";
      default: return eventType;
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const datePart = date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
    const timePart = date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
    return `${datePart} • ${timePart}`;
  };

  const exportToPDF = useCallback(async () => {
    setIsExporting(true);
    try {
      const params = new URLSearchParams();
      if (debouncedQueryValue) params.append("search", debouncedQueryValue);
      if (collectionFilter) params.append("collection", collectionFilter);
      if (storeFilter) params.append("storeId", storeFilter);
      if (dateFilter) params.append("dateRange", dateFilter);
      params.append("export", "true");

      const response = await shopifyFetch(`/api/activity?${params.toString()}`);
      if (!response.ok) throw new Error("Failed to fetch export data");
      const data = await response.json();
      const exportActivities = data.activities || [];

      const { default: jsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');
      
      const doc = new jsPDF();
      doc.text("Activity Log", 14, 15);

      const tableColumn = ["Date", "Event", "Title", "SKU", "Store", "Description"];
      const tableRows: any[] = [];

      exportActivities.forEach((item: any) => {
        const date = formatDate(item.createdAt);
        const event = getEventTitle(item.eventType);
        const title = item.productTitle || "-";
        const sku = item.sku || "-";
        const store = item.store?.label || item.store?.shopDomain || "Unknown Store";
        const desc = item.description;

        tableRows.push([date, event, title, sku, store, desc]);
      });

      autoTable(doc, {
        head: [tableColumn],
        body: tableRows,
        startY: 20,
        styles: { fontSize: 9 },
        headStyles: { fillColor: [13, 182, 157] } // #0db69d
      });

      doc.save(`Activity_Log_${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (error) {
      console.error("Export failed:", error);
      setErrorMsg("Failed to export activities");
    } finally {
      setIsExporting(false);
    }
  }, [debouncedQueryValue, collectionFilter, storeFilter, dateFilter]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 w-full overflow-x-hidden">
      <div className="flex flex-col gap-8 min-w-0 w-full">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 lg:gap-8">
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827', margin: 0 }}>
              Activity
            </h1>
            <p style={{ marginTop: 4, color: '#6b7280', fontSize: '0.875rem' }}>
              Full audit trail of product changes and sync events.
            </p>
          </div>

          <div className="flex items-center gap-4">
              <button
                onClick={exportToPDF}
                disabled={isExporting}
                className="flex items-center gap-2 bg-[#0db69d] hover:bg-[#0b9c86] text-white px-4 py-2 rounded-lg font-medium transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                {isExporting ? 'Exporting...' : 'Export'}
              </button>
            <StoreRoleBadge />
          </div>
        </div>

        <div className="w-full bg-white overflow-hidden rounded-xl border border-gray-200 shadow-sm">
            <div className="p-3 px-5 border-b border-slate-100 bg-slate-50/50 flex gap-3 flex-wrap items-center">
              <div className="flex-1 min-w-[250px]">
                  <SearchBar
                    label="Search"
                    labelHidden
                    placeholder="Search by Product Title or SKU..."
                    value={queryValue}
                    onChange={handleSearchChange}
                    autoComplete="off"
                    clearButton
                    onClearButtonClick={() => handleSearchChange("")}
                    prefix={<Icon source={SearchIcon} tone="base" />}
                  />
                </div>

              {/* Custom Tailwind Collection Select */}
              <div className="min-w-[180px]">
                <CustomSelect
                  label="Collection"
                  labelHidden
                  options={[
                    { label: 'All Collections', value: '' },
                    ...collectionOptions
                      .filter(opt => opt.value !== '')
                      .map(opt => ({ label: opt.label, value: opt.value }))
                  ]}
                  value={collectionFilter}
                  onChange={(value) => { setCollectionFilter(value); setPage(1); }}
                />
              </div>

              {/* Custom Tailwind Store Select (Master Only) */}
              {isMaster && isMultiStore && (
                <div className="min-w-[180px]">
                  <CustomSelect
                    label="Store"
                    labelHidden
                    options={[
                      { label: 'All Stores', value: 'all' },
                      ...storeOptions
                        .filter(opt => opt.value !== 'all')
                        .map(opt => ({ label: opt.label, value: opt.value }))
                    ]}
                    value={storeFilter}
                    onChange={(value) => { setStoreFilter(value); setPage(1); }}
                  />
                </div>
              )}

              {/* Date Filter Select */}
              <div className="min-w-[150px]">
                  <CustomSelect
                    label="Date Range"
                    labelHidden
                    options={[
                      { label: 'All Time', value: 'all' },
                      { label: 'This Day', value: 'today' },
                      { label: 'This Week', value: 'week' },
                      { label: 'This Month', value: 'month' },
                    ]}
                    value={dateFilter}
                    onChange={(value) => { setDateFilter(value); setPage(1); }}
                  />
              </div>
            </div>
            
            {errorMsg && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 mx-4">
                <strong>Error: </strong>{errorMsg}
              </div>
            )}

            {loading ? (
              <Loading label="Loading activities..." />
            ) : (
              <Box padding="400">
              {activities.length === 0 ? (
                <div style={{ padding: '60px', textAlign: 'center', color: '#6b7280' }}>
                  No activities found.
                </div>
              ) : (
                <ResourceList
                  resourceName={{ singular: "activity", plural: "activities" }}
                  items={activities}
                  renderItem={(item) => {
                    const { id, eventType, productTitle, sku, description, store, createdAt } = item;
                    const storeLabel = store?.label || store?.shopDomain || "Unknown Store";

                    return (
                      <ResourceItem id={id} key={id} onClick={() => { }}>
                        <BlockStack gap="200">
                          <InlineStack align="start" blockAlign="center" gap="200">
                            <Text as="span" variant="bodyMd">
                              {getEventIcon(eventType)}
                            </Text>
                            <Text variant="bodyMd" fontWeight="bold" as="span">
                              {getEventTitle(eventType)}
                            </Text>
                          </InlineStack>

                          <BlockStack gap="100">
                            <Text variant="headingMd" as="h3">
                              {productTitle}
                            </Text>
                            {sku && (
                              <Text variant="bodySm" as="p" tone="subdued">
                                SKU: {sku}
                              </Text>
                            )}
                          </BlockStack>

                          <Box paddingBlockStart="200">
                            <Text variant="bodyMd" as="p">
                              {description}
                            </Text>
                          </Box>

                          <Box paddingBlockStart="400">
                            <InlineStack align="space-between">
                              <span className="inline-flex items-center rounded-md bg-[#0db69d]/10 px-2 py-1 text-xs font-medium text-[#0db69d] ring-1 ring-inset ring-[#0db69d]/20">
                                {storeLabel}
                              </span>
                              <Text variant="bodySm" tone="subdued" as="span">
                                {formatDate(createdAt)}
                              </Text>
                            </InlineStack>
                          </Box>
                        </BlockStack>
                      </ResourceItem>
                    );
                  }}
                />
              )}
              
                <div className="flex justify-center mt-6 border-t border-gray-100 pt-4 pb-2">
                  <Pagination
                    hasPrevious={page > 1}
                    onPrevious={() => setPage(page - 1)}
                    hasNext={page < totalPages}
                    onNext={() => setPage(page + 1)}
                    label={`Page ${page} of ${totalPages}`}
                  />
                </div>
            </Box>
          )}
        </div>
      </div>
    </div>
  );
}
