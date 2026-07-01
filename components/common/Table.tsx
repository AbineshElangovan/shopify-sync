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
}

/* ── Centered full-page spinner ── */
function TableSpinner() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '56px 20px', gap: 16 }}>
      <style>{`
        @keyframes tbl-spin { to { transform: rotate(360deg); } }
        .tbl-ring {
          width: 44px; height: 44px; border-radius: 50%;
          border: 4px solid #e5e7eb;
          border-top-color: #4f46e5;
          animation: tbl-spin 0.75s linear infinite;
        }
      `}</style>
      <div className="tbl-ring" />
      <p style={{ margin: 0, fontSize: 13, color: '#9ca3af', fontWeight: 500 }}>Loading data…</p>
    </div>
  );
}

/* ── Rich empty state ── */
function DefaultEmptyState() {
  return (
    <div style={{ padding: '56px 20px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <svg width="56" height="56" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="32" cy="32" r="32" fill="#f3f4f6" />
        <path d="M20 44L26 26H38L44 44H20Z" fill="#d1d5db" />
        <rect x="26" y="20" width="12" height="4" rx="2" fill="#9ca3af" />
        <circle cx="32" cy="36" r="3" fill="#9ca3af" />
      </svg>
      <div>
        <p style={{ fontWeight: 600, fontSize: 15, color: '#374151', margin: 0 }}>No records found</p>
        <p style={{ fontSize: 13, color: '#9ca3af', margin: '4px 0 0' }}>Try adjusting your search or filter criteria.</p>
      </div>
    </div>
  );
}

/* ── Search input ── */
function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
      <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%', paddingLeft: 34, paddingRight: value ? 32 : 12, paddingTop: 8, paddingBottom: 8,
          border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, outline: 'none',
          transition: 'border-color 0.15s', backgroundColor: '#fff', boxSizing: 'border-box',
        }}
        onFocus={(e) => (e.target.style.borderColor = '#6366f1')}
        onBlur={(e) => (e.target.style.borderColor = '#d1d5db')}
      />
      {value && (
        <button
          onClick={() => onChange('')}
          style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 2, lineHeight: 1 }}
        >✕</button>
      )}
    </div>
  );
}

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
}: TableProps) {
  const [query, setQuery] = useState('');
  const [filterValue, setFilterValue] = useState('ALL');
  const [page, setPage] = useState(1);
  const itemsPerPage = 10;

  // Derive a soft background tint from headerColor (15% opacity)
  const headerBg = `${headerColor}22`;
  const headerText = headerColor;

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      let matchSearch = true;
      let matchFilter = true;
      if (searchable && searchKey && query) {
        const val = item[searchKey]?.toString().toLowerCase() || '';
        matchSearch = val.includes(query.toLowerCase());
      }
      if (filterable && filterKey && filterValue !== 'ALL') {
        matchFilter = item[filterKey] === filterValue;
      }
      return matchSearch && matchFilter;
    });
  }, [items, query, filterValue, searchable, searchKey, filterable, filterKey]);

  const totalPages = Math.ceil(filteredItems.length / itemsPerPage) || 1;
  const paginatedItems = paginate
    ? filteredItems.slice((page - 1) * itemsPerPage, page * itemsPerPage)
    : filteredItems;

  React.useEffect(() => { setPage(1); }, [query, filterValue]);

  const renderCell = (item: any, col: ColumnConfig) => {
    const val = item[col.key];
    switch (col.type) {
      case 'image':
        return val ? (
          <img src={val} alt="Product" style={{ width: 40, height: 40, borderRadius: 6, objectFit: 'cover', border: '1px solid #e5e7eb', display: 'block' }} />
        ) : (
          <div style={{ width: 40, height: 40, borderRadius: 6, backgroundColor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 600, color: '#94a3b8', border: '1px solid #e5e7eb' }}>
            IMG
          </div>
        );
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
    <div style={{ borderRadius: 12, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.07)', border: '1px solid #e5e7eb', backgroundColor: '#fff' }}>

      {/* ── Title bar ── */}
      {title && (
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: 12, backgroundColor: '#fff' }}>
          <div style={{ width: 4, height: 22, borderRadius: 4, backgroundColor: headerColor, flexShrink: 0 }} />
          <span style={{ fontWeight: 700, fontSize: 15, color: '#111827' }}>{title}</span>
        </div>
      )}

      {/* ── Search & Filter toolbar ── */}
      {(searchable || filterable) && !loading && (
        <div style={{ padding: '12px 20px', borderBottom: '1px solid #f1f5f9', backgroundColor: '#fafbff', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          {searchable && searchKey && (
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder={`Search ${title?.replace(/[^a-zA-Z ]/g, '').trim() || 'records'}…`}
            />
          )}
          {filterable && filterKey && (
            <div style={{ minWidth: 160 }}>
              <select
                value={filterValue}
                onChange={(e) => setFilterValue(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, color: '#374151', backgroundColor: '#fff', cursor: 'pointer', outline: 'none' }}
              >
                {filterOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          )}
          {(query || filterValue !== 'ALL') && (
            <span style={{ fontSize: 12, color: '#9ca3af' }}>
              {filteredItems.length} result{filteredItems.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      )}

      {/* ── Table body / Loading / Error ── */}
      {loading ? (
        <TableSpinner />
      ) : errorState ? (
        <div style={{ padding: '48px 20px', textAlign: 'center', color: '#dc2626' }}>
          {errorState}
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'auto' }}>
            <thead>
              <tr>
                {columns.map((col, i) => (
                  <th
                    key={col.key}
                    style={{
                      padding: '12px 16px',
                      backgroundColor: headerBg,
                      color: headerText,
                      fontWeight: 700,
                      fontSize: 12,
                      textAlign: 'left',
                      whiteSpace: 'nowrap',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      borderBottom: `2px solid ${headerColor}44`,
                      borderRight: i < columns.length - 1 ? '1px solid #f1f5f9' : 'none',
                    }}
                  >
                    {col.title}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginatedItems.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} style={{ padding: 0 }}>
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
                          padding: '12px 16px',
                          borderBottom: '1px solid #f1f5f9',
                          fontSize: 13,
                          verticalAlign: 'middle',
                          borderRight: ci < columns.length - 1 ? '1px solid #f8f9ff' : 'none',
                        }}
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
        <div style={{ padding: '12px 20px', borderTop: '1px solid #e5e7eb', backgroundColor: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <span style={{ fontSize: 12, color: '#9ca3af' }}>
            Showing {(page - 1) * itemsPerPage + 1}–{Math.min(page * itemsPerPage, filteredItems.length)} of {filteredItems.length} records
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => setPage((p) => Math.max(p - 1, 1))}
              disabled={page <= 1}
              style={{ padding: '6px 14px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, cursor: page <= 1 ? 'not-allowed' : 'pointer', backgroundColor: page <= 1 ? '#f9fafb' : '#fff', color: page <= 1 ? '#9ca3af' : '#374151', transition: 'all 0.15s' }}
            >← Prev</button>
            <span style={{ padding: '6px 12px', fontSize: 13, color: '#6b7280', border: '1px solid #e5e7eb', borderRadius: 6, backgroundColor: '#fafafa' }}>
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
              disabled={page >= totalPages}
              style={{ padding: '6px 14px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, cursor: page >= totalPages ? 'not-allowed' : 'pointer', backgroundColor: page >= totalPages ? '#f9fafb' : '#fff', color: page >= totalPages ? '#9ca3af' : '#374151', transition: 'all 0.15s' }}
            >Next →</button>
          </div>
        </div>
      )}
    </div>
  );
}
