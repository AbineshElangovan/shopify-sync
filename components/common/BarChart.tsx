'use client';
import React from 'react';
import { BarChart as RechartsBarChart, Bar, LineChart as RechartsLineChart, Line, AreaChart as RechartsAreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart as RechartsPieChart, Pie, Cell, } from 'recharts';


import { ChartCard } from '@/components/ui/ChartCard';

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


export function formatYTick(value: number): string {
  if (value >= 10_00_000) return `${(value / 10_00_000).toFixed(1)}Cr`;
  if (value >= 1_00_000) return `${(value / 1_00_000).toFixed(1)}L`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

const tooltipStyle = {
  borderRadius: 8,
  border: '1px solid #e5e7eb',
  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
  fontSize: 13,
};


export interface SeriesConfig {
  key: string;
  color: string;
  name: string;
}

export interface BarChartProps {
  title: string;
  subtitle?: string;
  data: any[];
  xKey: string;
  bars: SeriesConfig[];

  yTickFormatter?: (v: number) => string;
  yWidth?: number;
  height?: number;
}

export function BarChart({
  title, subtitle, data, xKey, bars,
  yTickFormatter = formatYTick, yWidth = 70, height = 280,
}: BarChartProps) {
  const hasData = data && data.length > 0;
  return (
    <ChartCard title={title} description={subtitle}>
      {!hasData ? <NoData /> : (
        <div style={{ width: '100%', height }}>
          <ResponsiveContainer width="100%" height="100%">
            <RechartsBarChart data={data} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey={xKey} axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 12 }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 12 }} width={yWidth} tickFormatter={yTickFormatter} />
              <Tooltip
                cursor={{ fill: 'rgba(0,0,0,0.04)' }}
                contentStyle={tooltipStyle}
                formatter={(value: any) => [Number(value).toLocaleString('en-IN'), '']}
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

export interface LineChartProps {
  title: string;
  subtitle?: string;
  data: any[];
  xKey: string;
  lines: SeriesConfig[];
  yTickFormatter?: (v: number) => string;
  yWidth?: number;
  height?: number;
}

export function LineChart({
  title, subtitle, data, xKey, lines,
  yTickFormatter = formatYTick, yWidth = 70, height = 280,
}: LineChartProps) {
  const hasData = data && data.length > 0;
  return (
    <ChartCard title={title} description={subtitle}>
      {!hasData ? <NoData /> : (
        <div style={{ width: '100%', height }}>
          <ResponsiveContainer width="100%" height="100%">
            <RechartsLineChart data={data} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey={xKey} axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 12 }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 12 }} width={yWidth} tickFormatter={yTickFormatter} />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value: any) => [Number(value).toLocaleString('en-IN'), '']}
              />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ paddingTop: 16, fontSize: 13 }} />
              {lines.map((line) => (
                <Line
                  key={line.key}
                  dataKey={line.key}
                  name={line.name}
                  stroke={line.color}
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: line.color, strokeWidth: 0 }}
                  activeDot={{ r: 6 }}
                />
              ))}
            </RechartsLineChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartCard>
  );
}

export interface AreaChartProps {
  title: string;
  subtitle?: string;
  data: any[];
  xKey: string;
  areas: SeriesConfig[];
  yTickFormatter?: (v: number) => string;
  yWidth?: number;
  height?: number;
}

export function AreaChart({
  title, subtitle, data, xKey, areas,
  yTickFormatter = formatYTick, yWidth = 70, height = 280,
}: AreaChartProps) {
  const hasData = data && data.length > 0;
  return (
    <ChartCard title={title} description={subtitle}>
      {!hasData ? <NoData /> : (
        <div style={{ width: '100%', height }}>
          <ResponsiveContainer width="100%" height="100%">
            <RechartsAreaChart data={data} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
              <defs>
                {areas.map((area) => (
                  <linearGradient key={area.key} id={`grad-${area.key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={area.color} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={area.color} stopOpacity={0.02} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey={xKey} axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 12 }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 12 }} width={yWidth} tickFormatter={yTickFormatter} />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value: any) => [Number(value).toLocaleString('en-IN'), '']}
              />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ paddingTop: 16, fontSize: 13 }} />
              {areas.map((area) => (
                <Area
                  key={area.key}
                  dataKey={area.key}
                  name={area.name}
                  stroke={area.color}
                  strokeWidth={2.5}
                  fill={`url(#grad-${area.key})`}
                  dot={{ r: 3, fill: area.color, strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                />
              ))}
            </RechartsAreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartCard>
  );
}
export interface PieChartProps {
  title: string;
  subtitle?: string;
  data: { name: string; value: number; color: string }[];

  unit?: string;

  innerRadius?: number | string;

  outerRadius?: number | string;
}

const RADIAN = Math.PI / 180;

function renderCustomLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) {
  if (percent < 0.05) return null;
  
  if (percent > 0.99) {
    return (
      <text x={cx} y={cy} fill="#111827" textAnchor="middle" dominantBaseline="central" fontSize={16} fontWeight={700}>
        100%
      </text>
    );
  }

  const innerR = typeof innerRadius === 'number' ? innerRadius : parseFloat(innerRadius as string) || 0;
  const outerR = typeof outerRadius === 'number' ? outerRadius : parseFloat(outerRadius as string) || 0;
  const radius = innerR + (outerR - innerR) * 0.55;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight={700}>
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
}

export function PieChart({ title, subtitle, data, unit = '', innerRadius = '60%', outerRadius = '80%' }: PieChartProps) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const hasData = data.length > 0 && total > 0;

  return (
    <ChartCard title={title} description={subtitle}>
      {!hasData ? <NoData message="No data to display" /> : (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <div style={{ width: '100%', height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <RechartsPieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  innerRadius={innerRadius}
                  outerRadius={outerRadius}
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
                  formatter={(value) => [`${unit}${Number(value).toLocaleString('en-IN')}`, '']}
                  contentStyle={tooltipStyle}
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: entry.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: '#374151', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={entry.name}>
                      {entry.name}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 13, color: '#6b7280' }}>{unit}{entry.value.toLocaleString('en-IN')}</span>
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
