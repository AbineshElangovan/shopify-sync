'use client';
import React from 'react';
import {
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
} from 'recharts';

/* ── Shared card shell ── */
function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div style={{ backgroundColor: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', boxShadow: '0 2px 8px rgba(0,0,0,0.07)', overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9' }}>
        <span style={{ fontWeight: 700, fontSize: 14, color: '#111827' }}>{title}</span>
        {subtitle && <p style={{ margin: '2px 0 0', fontSize: 12, color: '#9ca3af' }}>{subtitle}</p>}
      </div>
      <div style={{ padding: '20px' }}>{children}</div>
    </div>
  );
}

/* ── No data placeholder ── */
function NoData({ message = 'No data available yet' }: { message?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 220, gap: 12, color: '#9ca3af' }}>
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
        <rect width="48" height="48" rx="24" fill="#f3f4f6" />
        <rect x="12" y="30" width="6" height="8" rx="2" fill="#d1d5db" />
        <rect x="21" y="22" width="6" height="16" rx="2" fill="#d1d5db" />
        <rect x="30" y="16" width="6" height="22" rx="2" fill="#d1d5db" />
      </svg>
      <span style={{ fontSize: 13, fontWeight: 500 }}>{message}</span>
      <span style={{ fontSize: 12 }}>Add stores and products to see charts</span>
    </div>
  );
}

/* ── Bar Chart ── */
export interface BarChartProps {
  title: string;
  subtitle?: string;
  data: any[];
  xKey: string;
  bars: { key: string; color: string; name: string }[];
}

export function BarChart({ title, subtitle, data, xKey, bars }: BarChartProps) {
  const hasData = data && data.length > 0;

  return (
    <ChartCard title={title} subtitle={subtitle}>
      {!hasData ? (
        <NoData />
      ) : (
        <div style={{ width: '100%', height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <RechartsBarChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey={xKey} axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 12 }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 12 }} width={50} />
              <Tooltip
                cursor={{ fill: 'rgba(0,0,0,0.04)' }}
                contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: 13 }}
              />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ paddingTop: 16, fontSize: 13 }} />
              {bars.map((bar) => (
                <Bar key={bar.key} dataKey={bar.key} name={bar.name} fill={bar.color} radius={[5, 5, 0, 0]} maxBarSize={56} />
              ))}
            </RechartsBarChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartCard>
  );
}

/* ── Pie / Donut Chart ── */
export interface PieChartProps {
  title: string;
  subtitle?: string;
  data: { name: string; value: number; color: string }[];
  unit?: string;
}

const RADIAN = Math.PI / 180;

function renderCustomLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) {
  if (percent < 0.05) return null; // skip tiny slices
  const radius = innerRadius + (outerRadius - innerRadius) * 0.55;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight={700}>
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
}

export function PieChart({ title, subtitle, data, unit = '' }: PieChartProps) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const hasData = data.length > 0 && total > 0;

  return (
    <ChartCard title={title} subtitle={subtitle}>
      {!hasData ? (
        <NoData message="No data to display" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <div style={{ width: '100%', height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <RechartsPieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={88}
                  dataKey="value"
                  labelLine={false}
                  label={renderCustomLabel}
                  strokeWidth={2}
                  stroke="#fff"
                >
                  {data.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) => [`${unit}${Number(value).toLocaleString('en-US')}`, '']}
                  contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: 13 }}
                />
              </RechartsPieChart>
            </ResponsiveContainer>
          </div>

          {/* Legend */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', maxWidth: 280 }}>
            {data.map((entry) => {
              const pct = total > 0 ? ((entry.value / total) * 100).toFixed(1) : '0';
              return (
                <div key={entry.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: entry.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: '#374151', fontWeight: 500 }}>{entry.name}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 13, color: '#6b7280' }}>{unit}{entry.value.toLocaleString('en-US')}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: entry.color, backgroundColor: `${entry.color}1a`, borderRadius: 20, padding: '1px 7px' }}>
                      {pct}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </ChartCard>
  );
}
