'use client';
import { Grid } from '@shopify/polaris';
import { BarChart, PieChart } from '@/components/common/BarChart';

export interface StoreChartEntry {
  name: string;
  'Total Products': number;
  'Total Inventory': number;
  'Total Sales Value': number;
}

export interface DashboardChartsProps {
  chartData: {
    combinedData: StoreChartEntry[];
    currentStoreData: StoreChartEntry[];
  };
}

const STORE_COLORS = ['#7c3aed', '#0891b2', '#ea580c', '#16a34a', '#dc2626'];

export function DashboardCharts({ chartData }: DashboardChartsProps) {
  const { combinedData, currentStoreData } = chartData;

  // Build pie data for store sales % using ONLY current store data
  const salesPieData = currentStoreData.map((s, i) => ({
    name: s.name,
    value: s['Total Sales Value'],
    color: STORE_COLORS[i % STORE_COLORS.length],
  }));

  const productsPieData = currentStoreData.map((s, i) => ({
    name: s.name,
    value: s['Total Products'],
    color: STORE_COLORS[i % STORE_COLORS.length],
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* Row 1 – Products vs Inventory grouped bar chart */}
      <BarChart
        title="Inventory Comparison Chart"
        subtitle="Store Comparison — Products & Inventory"
        data={combinedData}
        xKey="name"
        bars={[
          { key: 'Total Products',  color: '#8b5cf6', name: 'Total Products'  },
          { key: 'Total Inventory', color: '#3b82f6', name: 'Total Inventory' },
        ]}
      />

      {/* Row 2 – Sales Value bar + two pie charts */}
      <Grid>
        <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 6, xl: 6 }}>
          <BarChart
            title="Sales Value — Current Store"
            subtitle="Estimated revenue for this store (₹500 per unit)"
            data={currentStoreData}
            xKey="name"
            bars={[
              { key: 'Total Sales Value', color: '#10b981', name: 'Sales Value (₹)' },
            ]}
          />
        </Grid.Cell>
        <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 3, lg: 3, xl: 3 }}>
          <PieChart
            title="Sales Share %"
            subtitle="Current store sales"
            data={salesPieData}
            unit="₹"
          />
        </Grid.Cell>
        <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 3, lg: 3, xl: 3 }}>
          <PieChart
            title="Products Share %"
            subtitle="Current store products"
            data={productsPieData}
          />
        </Grid.Cell>
      </Grid>

    </div>
  );
}
