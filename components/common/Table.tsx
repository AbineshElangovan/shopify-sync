'use client';
import React, { useState, useMemo } from 'react';
import { Badge, Text } from '@shopify/polaris';

export interface ColumnConfig {
  title: string;
  key: string;
  type?: 'text' | 'image' | 'badge' | 'bold' | 'status' | 'custom_html';
  badgeRules?: { [key: string]: 'success' | 'critical' | 'warning' | 'info' };
}

export interface TableProps {
  title?: string;
  headerColor?: string;
  columns: ColumnConfig[];
  items: any[];
  emptyState?: React.ReactNode;
  errorState?: React.ReactNode;
  loading?: boolean;
  searchable?: boolean;
  searchKey?: string;
  filterable?: boolean;
  filterKey?: string;
  filterOptions?: { label: string; value: string }[];
  paginate?: boolean;
  // Server-side support props
  serverSide?: boolean;
  totalItems?: number;
  page?: number;
  totalPages?: number;
  onPageChange?: (page: number) => void;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  filterValue?: string;
  onFilterChange?: (value: string) => void;
  itemsPerPage?: number;
}

/* ── Centered full-page spinner ── */
function TableSpinner() {
  return (
    <div className="flex flex-col items-center justify-center p-[56px_20px] gap-4">
      <div className="w-11 h-11 rounded-full border-4 border-gray-200 border-t-indigo-600 animate-spin" />
      <p className="m-0 text-[13px] text-gray-400 font-medium">Loading data…</p>
    </div>
  );
}

/* ── Rich empty state ── */
function DefaultEmptyState() {
  return (
    <div className="p-[56px_20px] text-center flex flex-col items-center gap-3">
      <svg width="56" height="56" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="32" cy="32" r="32" fill="#f3f4f6" />
        <path d="M20 44L26 26H38L44 44H20Z" fill="#d1d5db" />
        <rect x="26" y="20" width="12" height="4" rx="2" fill="#9ca3af" />
        <circle cx="32" cy="36" r="3" fill="#9ca3af" />
      </svg>
      <div>
        <p className="font-semibold text-[15px] text-gray-700 m-0">No records found</p>
        <p className="text-[13px] text-gray-400 mt-1 mb-0">Try adjusting your search or filter criteria.</p>
      </div>
    </div>
  );
}

/* ── Search input ── */
function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative flex-1 min-w-[180px]">
      <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-8.5 pr-8 py-2 border border-gray-300 rounded-lg text-[13px] outline-none transition-colors bg-white box-border focus:border-indigo-500"
      />
      {value && (
        <button
          onClick={() => onChange('')}
          className="absolute right-2 top-1/2 -translate-y-1/2 bg-transparent border-none cursor-pointer text-gray-400 p-0.5 leading-none"
        >✕</button>
      )}
    </div>
  );
}

const ImageCell = ({ src }: { src: string }) => {
  const [error, setError] = useState(false);
  if (error || !src) {
    return (
      <div style={{ width: 40, height: 40, borderRadius: 6, backgroundColor: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed #cbd5e1' }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21 15 16 10 5 21" />
        </svg>
      </div>
    );
  }
  return <img src={src} alt="Product" onError={() => setError(true)} style={{ width: 40, height: 40, borderRadius: 6, objectFit: 'cover', border: '1px solid #e5e7eb', display: 'block' }} />;
};

export function Table({
  title,
  headerColor = '#4f46e5',
  columns,
  items,
  emptyState,
  errorState,
  loading = false,
  searchable = true,
  searchKey,
  filterable = true,
  filterKey,
  filterOptions = [{ label: 'All', value: 'ALL' }],
  paginate = true,
  serverSide = false,
  totalItems,
  page: controlledPage,
  totalPages: controlledTotalPages,
  onPageChange,
  searchValue: controlledSearchValue,
  onSearchChange,
  filterValue: controlledFilterValue,
  onFilterChange,
  itemsPerPage = 10,
}: TableProps) {
  const [localQuery, setLocalQuery] = useState('');
  const [localFilterValue, setLocalFilterValue] = useState('ALL');
  const [localPage, setLocalPage] = useState(1);

  const query = serverSide ? (controlledSearchValue ?? '') : localQuery;
  const setQuery = (val: string) => {
    if (serverSide) {
      onSearchChange?.(val);
    } else {
      setLocalQuery(val);
    }
  };

  const currentFilterValue = serverSide ? (controlledFilterValue ?? 'ALL') : localFilterValue;
  const handleFilterChange = (val: string) => {
    if (serverSide) {
      onFilterChange?.(val);
    } else {
      setLocalFilterValue(val);
    }
  };

  const currentPage = serverSide ? (controlledPage ?? 1) : localPage;
  const handlePageChange = (p: number) => {
    if (serverSide) {
      onPageChange?.(p);
    } else {
      setLocalPage(p);
    }
  };

  // Derive a soft background tint from headerColor (15% opacity)
  const headerBg = `${headerColor}22`;
  const headerText = headerColor;

  const filteredItems = useMemo(() => {
    if (serverSide) return items;
    return items.filter((item) => {
      let matchSearch = true;
      let matchFilter = true;
      if (searchable && searchKey && query) {
        const val = item[searchKey]?.toString().toLowerCase() || '';
        matchSearch = val.includes(query.toLowerCase());
      }
      if (filterable && filterKey && currentFilterValue !== 'ALL') {
        matchFilter = item[filterKey] === currentFilterValue;
      }
      return matchSearch && matchFilter;
    });
  }, [items, query, currentFilterValue, searchable, searchKey, filterable, filterKey, serverSide]);

  const totalPages = serverSide
    ? (controlledTotalPages ?? 1)
    : (Math.ceil(filteredItems.length / itemsPerPage) || 1);

  const paginatedItems = serverSide
    ? items
    : (paginate ? filteredItems.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage) : filteredItems);

  React.useEffect(() => {
    if (!serverSide) {
      setLocalPage(1);
    }
  }, [query, currentFilterValue, serverSide]);

  const renderCell = (item: any, col: ColumnConfig) => {
    const val = item[col.key];
    switch (col.type) {
      case 'image':
        return <ImageCell src={val} />;
      case 'bold':
        return <strong style={{ fontWeight: 600, color: '#111827' }}>{val ?? '—'}</strong>;
      case 'badge':
      case 'status': {
        const tone = col.badgeRules ? (col.badgeRules[val] || 'info') : 'info';
        return <Badge tone={tone as any}>{val ?? '—'}</Badge>;
      }
      case 'custom_html':
        return <div dangerouslySetInnerHTML={{ __html: val }} />;
      default:
        return <span style={{ color: '#374151', fontSize: 13 }}>{val ?? '—'}</span>;
    }
  };

  return (
    <div className="rounded-xl overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,0.07)] border border-gray-200 bg-white">

      {/* ── Title bar ── */}
      {title && (
        <div className="p-[14px_20px] border-b border-gray-200 flex items-center gap-3 bg-white">
          <div style={{ backgroundColor: headerColor }} className="w-1 h-5.5 rounded shrink-0" />
          <span className="font-bold text-[15px] text-gray-900">{title}</span>
        </div>
      )}

      {/* ── Search & Filter toolbar ── */}
      {(searchable || filterable) && !loading && (
        <div className="p-3 px-5 border-b border-slate-100 bg-slate-50/50 flex gap-3 flex-wrap items-center">
          {searchable && (searchKey || serverSide) && (
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder={`Search ${title?.replace(/[^a-zA-Z ]/g, '').trim() || 'records'}…`}
            />
          )}
          {filterable && filterKey && (
            <div className="min-w-[160px]">
              <select
                value={currentFilterValue}
                onChange={(e) => handleFilterChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-[13px] text-gray-700 bg-white cursor-pointer outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
              >
                {filterOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          )}
          {(query || currentFilterValue !== 'ALL') && (
            <span className="text-xs text-gray-400">
              {serverSide ? (totalItems ?? items.length) : filteredItems.length} result{((serverSide ? (totalItems ?? items.length) : filteredItems.length) !== 1) ? 's' : ''}
            </span>
          )}
        </div>
      )}

      {/* ── Table body / Loading / Error ── */}
      {loading ? (
        <TableSpinner />
      ) : errorState ? (
        <div className="p-12 px-5 text-center text-red-600 font-medium">
          {errorState}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse table-auto">
            <thead>
              <tr>
                {columns.map((col, i) => (
                  <th
                    key={col.key}
                    style={{
                      backgroundColor: headerBg,
                      color: headerText,
                      borderBottom: `2px solid ${headerColor}44`,
                      borderRight: i < columns.length - 1 ? '1px solid #f1f5f9' : 'none',
                    }}
                    className="p-[12px_16px] font-bold text-xs text-left uppercase tracking-wider whitespace-nowrap"
                  >
                    {col.title}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginatedItems.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="p-0">
                    {emptyState ?? <DefaultEmptyState />}
                  </td>
                </tr>
              ) : (
                paginatedItems.map((item, index) => (
                  <tr
                    key={item.id ?? index}
                    style={{ backgroundColor: index % 2 === 0 ? '#fff' : '#f8f9ff', transition: 'background-color 0.15s' }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.backgroundColor = `${headerColor}0f`; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.backgroundColor = index % 2 === 0 ? '#fff' : '#f8f9ff'; }}
                  >
                    {columns.map((col, ci) => (
                      <td
                        key={col.key}
                        style={{
                          borderRight: ci < columns.length - 1 ? '1px solid #f8f9ff' : 'none',
                        }}
                        className="p-[12px_16px] border-b border-slate-100 text-[13px] align-middle"
                      >
                        {renderCell(item, col)}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Pagination ── */}
      {!loading && paginate && totalPages > 1 && (
        <div className="p-3 px-5 border-t border-gray-200 bg-white flex items-center justify-between flex-wrap gap-2">
          <span className="text-xs text-gray-400">
            {serverSide ? (
              `Showing ${(currentPage - 1) * itemsPerPage + 1}–${Math.min(currentPage * itemsPerPage, totalItems ?? items.length)} of ${totalItems ?? items.length} records`
            ) : (
              `Showing ${(currentPage - 1) * itemsPerPage + 1}–${Math.min(currentPage * itemsPerPage, filteredItems.length)} of ${filteredItems.length} records`
            )}
          </span>
          <div className="flex gap-1.5">
            <button
              onClick={() => handlePageChange(Math.max(currentPage - 1, 1))}
              disabled={currentPage <= 1}
              style={{ cursor: currentPage <= 1 ? 'not-allowed' : 'pointer' }}
              className="p-[6px_14px] border border-gray-300 rounded-lg text-[13px] transition duration-150 disabled:opacity-50 disabled:bg-gray-50 disabled:text-gray-400 bg-white text-gray-700 hover:bg-gray-50"
            >← Prev</button>
            <span className="p-[6px_12px] text-[13px] text-gray-500 border border-gray-200 rounded-lg bg-slate-50">
              {currentPage} / {totalPages}
            </span>
            <button
              onClick={() => handlePageChange(Math.min(currentPage + 1, totalPages))}
              disabled={currentPage >= totalPages}
              style={{ cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer' }}
              className="p-[6px_14px] border border-gray-300 rounded-lg text-[13px] transition duration-150 disabled:opacity-50 disabled:bg-gray-50 disabled:text-gray-400 bg-white text-gray-700 hover:bg-gray-50"
            >Next →</button>
          </div>
        </div>
      )}
    </div>
  );
}
