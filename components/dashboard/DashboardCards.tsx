'use client';
import React from 'react';
import {
  ProductIcon,
  ChartVerticalIcon,
  AlertTriangleIcon,
  CheckCircleIcon,
} from '@shopify/polaris-icons';
import { StatCard } from '@/components/ui/StatCard';

export interface DashboardCardsProps {
  stats: {
    totalProducts: number;
    totalInventory: number;
    lowStock: number;
    activeProducts: number;
    lastUpdated: string;
  };
  lowStockThreshold?: number;
  crossStore?: boolean;
}

export function DashboardCards({ stats, lowStockThreshold = 15, crossStore = false }: DashboardCardsProps) {
  const statsConfig = [
    {
      key: 'totalProducts' as const,
      title: 'Total Products',
      description: crossStore ? 'Products across all stores' : 'Products in this store',
      icon: ProductIcon,
      color: 'primary' as const,
    },
    {
      key: 'totalInventory' as const,
      title: 'Total Inventory',
      description: crossStore ? 'Total stock across all stores' : 'Total stock in this store',
      icon: ChartVerticalIcon,
      color: 'info' as const,
    },
    {
      key: 'lowStock' as const,
      title: 'Low Stock',
      description: `Products needing restock (≤${lowStockThreshold} units)`,
      icon: AlertTriangleIcon,
      color: 'warning' as const,
    },
    {
      key: 'activeProducts' as const,
      title: 'Active Products',
      description: 'Products with available inventory',
      icon: CheckCircleIcon,
      color: 'success' as const,
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {statsConfig.map(({ key, title, description, icon, color }) => (
        <div key={key}>
          <StatCard
            title={title}
            description={description}
            value={stats[key].toLocaleString('en-US')}
            icon={icon}
            color={color}
          />
        </div>
      ))}
    </div>
  );
}
