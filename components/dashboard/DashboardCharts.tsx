'use client';
// Removed Polaris Grid
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

const STORE_COLORS = ['#0db69d', '#0b8d7b', '#dffaf6', '#14b8a6', '#0d9488'];

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
          { key: 'Total Products',  color: '#0b8d7b', name: 'Total Products'  },
          { key: 'Total Inventory', color: '#0db69d', name: 'Total Inventory' },
        ]}
      />

      {/* Row 2 – Sales Value bar + two pie charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-5">
        <div className="col-span-1 md:col-span-2">
          <BarChart
            title="Sales Value — Current Store"
            subtitle="Estimated revenue for this store (₹500 per unit)"
            data={currentStoreData}
            xKey="name"
            bars={[
              { key: 'Total Sales Value', color: '#0db69d', name: 'Sales Value (₹)' },
            ]}
          />
        </div>
        <div className="col-span-1 md:col-span-1">
          <PieChart
            title="Sales Share %"
            subtitle="Current store sales"
            data={salesPieData}
            unit="₹"
          />
        </div>
        <div className="col-span-1 md:col-span-1">
          <PieChart
            title="Products Share %"
            subtitle="Current store products"
            data={productsPieData}
          />
        </div>
      </div>

    </div>
  );
}
