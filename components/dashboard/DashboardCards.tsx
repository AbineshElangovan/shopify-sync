'use client';
import React from 'react';
import { Grid } from '@shopify/polaris';
import {
  ProductIcon,
  ChartVerticalIcon,
  AlertTriangleIcon,
  CheckCircleIcon,
} from '@shopify/polaris-icons';
import { StatCard } from '@/components/common';

export interface DashboardCardsProps {
  stats: {
    totalProducts: number;
    totalInventory: number;
    lowStock: number;
    activeProducts: number;
    lastUpdated: string;
  };
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
            value={stats[key].toLocaleString('en-US')}
            icon={icon}
            gradient={gradient}
            iconBg={iconBg}
          />
        </Grid.Cell>
      ))}
    </Grid>
  );
}
