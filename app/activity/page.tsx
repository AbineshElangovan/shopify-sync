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
} from "@shopify/polaris";
import { ProductAddIcon, EditIcon, DeleteIcon, CartIcon, InfoIcon } from "@shopify/polaris-icons";
import { shopifyFetch } from "@/lib/shopify/Client";
import { StoreRoleBadge } from '@/components/ui/StoreRoleBadge';
import { Loading } from '@/components/common';

export default function ActivityPage() {
  const [activities, setActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters state
  const [queryValue, setQueryValue] = useState("");
  const [collectionFilter, setCollectionFilter] = useState("");
  const [storeFilter, setStoreFilter] = useState("");

  const [collectionOptions, setCollectionOptions] = useState<any[]>([]);
  const [storeOptions, setStoreOptions] = useState<any[]>([]);

  const [isMaster, setIsMaster] = useState(false);
  const [isMultiStore, setIsMultiStore] = useState(false);

  const fetchActivities = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (queryValue) params.append("search", queryValue);
      if (collectionFilter) params.append("collection", collectionFilter);
      if (storeFilter) params.append("storeId", storeFilter);

      const response = await shopifyFetch(`/api/activity?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        setActivities(data.activities || []);
        setIsMaster(data.isMaster || false);
        setIsMultiStore(data.isMultiStore || false);
        setCollectionOptions([
          { label: "All Collections", value: "" },
          ...(data.collectionOptions || [])
        ]);
        setStoreOptions([
          { label: "All Stores", value: "all" },
          ...(data.storeOptions || [])
        ]);
      }
    } catch (error) {
      console.error("Failed to fetch activities:", error);
    } finally {
      setLoading(false);
    }
  }, [queryValue, collectionFilter, storeFilter]);

  useEffect(() => {
    fetchActivities();
  }, [fetchActivities]);

  const handleSearchChange = useCallback((value: string) => setQueryValue(value), []);

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

  const exportToPDF = useCallback(() => {
    import('jspdf').then(({ default: jsPDF }) => {
      import('jspdf-autotable').then(({ default: autoTable }) => {
        const doc = new jsPDF();
        doc.text("Activity Log", 14, 15);

        const tableColumn = ["Date", "Event", "Title", "SKU", "Store", "Description"];
        const tableRows: any[] = [];

        activities.forEach(item => {
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
      });
    });
  }, [activities]);

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
              className="bg-[#0db69d] hover:bg-[#0b9c86] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm flex items-center gap-2"
            >
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Export
            </button>
            <StoreRoleBadge />
          </div>
        </div>

        {loading ? (
          <Loading label="Loading activities..." />
        ) : (
          <div className="w-full bg-white overflow-hidden rounded-xl border border-gray-200 shadow-sm">
            <div className="p-3 px-5 border-b border-slate-100 bg-slate-50/50 flex gap-3 flex-wrap items-center">
              {/* Custom Tailwind Search */}
              <div className="relative flex-1 min-w-[250px]">
                <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="text"
                  placeholder="Search by Product Title or SKU..."
                  value={queryValue}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className="w-full pl-8 pr-8 py-2 border border-gray-300 rounded-lg text-[13px] outline-none transition-colors bg-white box-border focus:border-[#0db69d] focus:ring-1 focus:ring-[#0db69d]"
                />
                {queryValue && (
                  <button
                    onClick={() => handleSearchChange("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 bg-transparent border-none cursor-pointer text-gray-400 p-0.5 leading-none"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Custom Tailwind Collection Select */}
              <div className="min-w-[180px]">
                <select
                  value={collectionFilter}
                  onChange={(e) => setCollectionFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-[13px] text-gray-700 bg-white cursor-pointer outline-none focus:border-[#0db69d] focus:ring-1 focus:ring-[#0db69d] transition-colors"
                >
                  {collectionOptions.length > 0 ? (
                    collectionOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)
                  ) : (
                    <option value="">All Collections</option>
                  )}
                </select>
              </div>

              {/* Custom Tailwind Store Select (Master Only) */}
              {isMaster && isMultiStore && (
                <div className="min-w-[180px]">
                  <select
                    value={storeFilter}
                    onChange={(e) => setStoreFilter(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-[13px] text-gray-700 bg-white cursor-pointer outline-none focus:border-[#0db69d] focus:ring-1 focus:ring-[#0db69d] transition-colors"
                  >
                    {storeOptions.length > 0 ? (
                      storeOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)
                    ) : (
                      <option value="all">All Stores</option>
                    )}
                  </select>
                </div>
              )}
            </div>
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
            </Box>
          </div>
        )}
      </div>
    </div>
  );
}
