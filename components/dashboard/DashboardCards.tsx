'use client';
import React from 'react';
import { Grid, Icon } from '@shopify/polaris';
import {
  ProductIcon,
  ChartVerticalIcon,
  AlertTriangleIcon,
  CheckCircleIcon,
} from '@shopify/polaris-icons';

export interface DashboardCardsProps {
  stats: {
    totalProducts: number;
    totalInventory: number;
    lowStock: number;
    activeProducts: number;
    lastUpdated: string;
  };
}

interface StatCardProps {
  label: string;
  description: string;
  value: string;
  lastUpdated: string;
  icon: React.ComponentProps<typeof Icon>['source'];
  gradient: string;        // CSS gradient string
  iconBg: string;          // icon circle bg
}

function StatCard({ label, description, value, lastUpdated, icon, gradient, iconBg }: StatCardProps) {
  return (
    <div
      style={{
        background: gradient,
        borderRadius: '14px',
        padding: '22px 20px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
        color: '#fff',
        transition: 'transform 0.2s ease, box-shadow 0.2s ease',
        cursor: 'default',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
      }}
      className="stat-card"
    >
      <style>{`
        .stat-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 8px 24px rgba(0,0,0,0.2) !important;
        }
      `}</style>

      {/* Top row: label + icon */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <p style={{ fontSize: '0.78rem', fontWeight: 500, opacity: 0.85, margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {label}
          </p>
          <p style={{ fontSize: '0.72rem', opacity: 0.65, margin: '2px 0 0', maxWidth: '160px' }}>
            {description}
          </p>
        </div>
        <div
          style={{
            width: 46,
            height: 46,
            borderRadius: '50%',
            backgroundColor: iconBg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Icon source={icon} />
        </div>
      </div>

      {/* Value */}
      <div>
        <p style={{ fontSize: '2rem', fontWeight: 800, margin: 0, lineHeight: 1 }}>
          {value}
        </p>
      </div>

      {/* Last updated */}
      <div style={{ marginTop: 'auto', borderTop: '1px solid rgba(255,255,255,0.2)', paddingTop: '10px' }}>
        <p style={{ fontSize: '0.72rem', opacity: 0.7, margin: 0 }}>
          🕐 Updated {lastUpdated}
        </p>
      </div>
    </div>
  );
}

const STATS_CONFIG = [
  {
    key: 'totalProducts' as const,
    label: 'Total Products',
    description: 'All synced products across stores',
    icon: ProductIcon,
    gradient: 'linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)',
    iconBg: 'rgba(255,255,255,0.2)',
  },
  {
    key: 'totalInventory' as const,
    label: 'Total Inventory',
    description: 'Combined stock across all stores',
    icon: ChartVerticalIcon,
    gradient: 'linear-gradient(135deg, #1d4ed8 0%, #3b82f6 100%)',
    iconBg: 'rgba(255,255,255,0.2)',
  },
  {
    key: 'lowStock' as const,
    label: 'Low Stock',
    description: 'Products needing restock (≤15 units)',
    icon: AlertTriangleIcon,
    gradient: 'linear-gradient(135deg, #c2410c 0%, #f97316 100%)',
    iconBg: 'rgba(255,255,255,0.2)',
  },
  {
    key: 'activeProducts' as const,
    label: 'Active Products',
    description: 'Products with available inventory',
    icon: CheckCircleIcon,
    gradient: 'linear-gradient(135deg, #15803d 0%, #22c55e 100%)',
    iconBg: 'rgba(255,255,255,0.2)',
  },
];

export function DashboardCards({ stats }: DashboardCardsProps) {
  return (
    <Grid>
      {STATS_CONFIG.map(({ key, label, description, icon, gradient, iconBg }) => (
        <Grid.Cell key={key} columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
          <StatCard
            label={label}
            description={description}
            value={stats[key].toLocaleString()}
            lastUpdated={stats.lastUpdated}
            icon={icon}
            gradient={gradient}
            iconBg={iconBg}
          />
        </Grid.Cell>
      ))}
    </Grid>
  );
}
