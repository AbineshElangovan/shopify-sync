'use client'
import { Page, Grid, BlockStack, Button, IndexTable, Badge, Avatar, ProgressBar, Text } from '@shopify/polaris'
import type { IndexTableProps } from '@shopify/polaris'
import { RefreshIcon } from '@shopify/polaris-icons'
import ReusableTable from '@/components/ui/table'

type Headings = IndexTableProps['headings']

const STATS = [
  { label: 'TOTAL PRODUCTS',  value: '248', bg: 'bg-purple-600'  },
  { label: 'TOTAL INVENTORY', value: '12,540', bg: 'bg-cyan-500' },
  { label: 'LOW STOCK',       value: '14', bg: 'bg-rose-500'     },
  { label: 'ACTIVE PRODUCTS', value: '231', bg: 'bg-emerald-500' },
]

const ACTIVITY_HEADINGS: Headings = [
  { title: 'Image'    },
  { title: 'Product'  },
  { title: 'SKU'      },
  { title: 'Action'   },
  { title: 'Quantity' },
  { title: 'Date'     },
]

const LOW_STOCK_HEADINGS: Headings = [
  { title: 'Image'         },
  { title: 'Product'       },
  { title: 'SKU'           },
  { title: 'Current Stock' },
  { title: 'Status'        },
]

const RECENT_HEADINGS: Headings = [
  { title: 'Image'   },
  { title: 'Product' },
  { title: 'Vendor'  },
  { title: 'Price'   },
  { title: 'Status'  },
]

const ACTIVITIES = [
  { id: '1', initials: 'NA', color: 'bg-purple-500', product: 'Nike Air Max 90',    sku: 'NK001', action: 'Added',   qty: '+20', date: 'Today, 10:32 AM',  positive: true  },
  { id: '2', initials: 'AW', color: 'bg-blue-400',   product: 'Apple Watch SE',     sku: 'AW002', action: 'Reduced', qty: '-5',  date: 'Today, 09:15 AM',  positive: false },
  { id: '3', initials: 'AT', color: 'bg-teal-500',   product: 'Adidas Tote Bag',    sku: 'AD003', action: 'Added',   qty: '+12', date: 'Yesterday',        positive: true  },
  { id: '4', initials: 'L5', color: 'bg-yellow-500', product: 'Levis 511 Jeans',    sku: 'LV004', action: 'Reduced', qty: '-3',  date: 'Yesterday',        positive: false },
  { id: '5', initials: 'PR', color: 'bg-pink-500',   product: 'Puma Running Shoes', sku: 'PM005', action: 'Added',   qty: '+30', date: '2 days ago',       positive: true  },
]

const LOW_STOCK = [
  { id: '1', initials: 'AA', color: 'bg-green-500',  product: 'Apple AirPods Pro',  sku: 'AP001', stock: 2,  max: 50, status: 'Critical', statusColor: 'critical' as const },
  { id: '2', initials: 'UH', color: 'bg-orange-400', product: 'USB-C Hub',          sku: 'UC003', stock: 4,  max: 50, status: 'Critical', statusColor: 'critical' as const },
  { id: '3', initials: 'MK', color: 'bg-red-400',    product: 'Mechanical Keyboard', sku: 'KB010', stock: 5, max: 50, status: 'Low',      statusColor: 'warning'  as const },
  { id: '4', initials: 'WM', color: 'bg-pink-400',   product: 'Wireless Mouse',     sku: 'MS002', stock: 7,  max: 50, status: 'Low',      statusColor: 'warning'  as const },
]

const RECENT_PRODUCTS = [
  { id: '1', initials: 'NA', color: 'bg-purple-500', product: 'Nike Air Max 90',    vendor: 'Nike',    price: '₹4,999',  status: 'Active'   },
  { id: '2', initials: 'AW', color: 'bg-blue-400',   product: 'Apple Watch SE',     vendor: 'Apple',   price: '₹29,999', status: 'Active'   },
  { id: '3', initials: 'AT', color: 'bg-teal-500',   product: 'Adidas Tote Bag',    vendor: 'Adidas',  price: '₹1,299',  status: 'Active'   },
  { id: '4', initials: 'L5', color: 'bg-yellow-500', product: 'Levis 511 Jeans',    vendor: 'Levis',   price: '₹3,499',  status: 'Inactive' },
  { id: '5', initials: 'PR', color: 'bg-pink-500',   product: 'Puma Running Shoes', vendor: 'Puma',    price: '₹5,999',  status: 'Active'   },
]

export default function DashboardView() {
  return (
    <Page
      title="Dashboard"
      subtitle="Welcome back! Manage your Shopify inventory efficiently."
      primaryAction={
        <Button icon={RefreshIcon} variant="primary">Refresh</Button>
      }
    >
      <BlockStack gap="600">

        {/* Stat Cards */}
        <Grid>
          {STATS.map(({ label, value, bg }) => (
            <Grid.Cell key={label} columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
              <div className={bg + ' rounded-xl px-6 py-7 flex items-center justify-between shadow-sm'}>
                <BlockStack gap="100">
                  <span className="text-white/80 text-xs font-semibold uppercase tracking-widest">
                    {label}
                  </span>
                  <span className="text-white text-4xl font-bold">{value}</span>
                </BlockStack>
              </div>
            </Grid.Cell>
          ))}
        </Grid>

        {/* Recent Inventory Activities */}
        <ReusableTable
          title="Recent Inventory Activities"
          accentColor="bg-green-500"
          linkLabel="View all logs"
          linkUrl="/logs"
          resourceName={{ singular: 'activity', plural: 'activities' }}
          headings={ACTIVITY_HEADINGS}
          itemCount={ACTIVITIES.length}
          emptyStateHeading="No inventory activity yet"
          emptyStateDescription="Connect your Shopify stores to start syncing inventory."
          emptyStateAction={{ content: 'Connect a Store', url: '/settings' }}
        >
          {ACTIVITIES.map(({ id, initials, color, product, sku, action, qty, date, positive }, index) => (
            <IndexTable.Row id={id} key={id} position={index}>
              <IndexTable.Cell>
                <div className={color + ' w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold'}>
                  {initials}
                </div>
              </IndexTable.Cell>
              <IndexTable.Cell>
                <Text as="span" variant="bodyMd" fontWeight="semibold">{product}</Text>
              </IndexTable.Cell>
              <IndexTable.Cell>
                <Text as="span" variant="bodySm" tone="subdued">{sku}</Text>
              </IndexTable.Cell>
              <IndexTable.Cell>
                <span className={'flex items-center gap-1 text-sm font-medium ' + (positive ? 'text-green-600' : 'text-red-500')}>
                  <span className={'w-2 h-2 rounded-full ' + (positive ? 'bg-green-500' : 'bg-red-500')} />
                  {action}
                </span>
              </IndexTable.Cell>
              <IndexTable.Cell>
                <Text as="span" variant="bodyMd" fontWeight="bold" tone={positive ? 'success' : 'critical'}>
                  {qty}
                </Text>
              </IndexTable.Cell>
              <IndexTable.Cell>
                <Text as="span" variant="bodySm" tone="subdued">{date}</Text>
              </IndexTable.Cell>
            </IndexTable.Row>
          ))}
        </ReusableTable>

        {/* Low Stock Products */}
        <ReusableTable
          title="Low Stock Products — Sorted by Stock (Lowest First)"
          accentColor="bg-rose-500"
          linkLabel="View all products"
          linkUrl="/products"
          resourceName={{ singular: 'product', plural: 'products' }}
          headings={LOW_STOCK_HEADINGS}
          itemCount={LOW_STOCK.length}
          emptyStateHeading="No low stock products"
          emptyStateDescription="All inventory levels are healthy."
        >
          {LOW_STOCK.map(({ id, initials, color, product, sku, stock, max, status, statusColor }, index) => (
            <IndexTable.Row id={id} key={id} position={index}>
              <IndexTable.Cell>
                <div className={color + ' w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold'}>
                  {initials}
                </div>
              </IndexTable.Cell>
              <IndexTable.Cell>
                <Text as="span" variant="bodyMd" fontWeight="semibold">{product}</Text>
              </IndexTable.Cell>
              <IndexTable.Cell>
                <Text as="span" variant="bodySm" tone="subdued">{sku}</Text>
              </IndexTable.Cell>
              <IndexTable.Cell>
                <div className="flex items-center gap-3">
                  <Text as="span" variant="bodyMd" fontWeight="bold">{stock}</Text>
                  <div className="w-24">
                    <ProgressBar
                      progress={(stock / max) * 100}
                      tone={statusColor === 'critical' ? 'critical' : 'highlight'}
                      size="small"
                    />
                  </div>
                </div>
              </IndexTable.Cell>
              <IndexTable.Cell>
                <Badge tone={statusColor}>{status}</Badge>
              </IndexTable.Cell>
            </IndexTable.Row>
          ))}
        </ReusableTable>

        {/* Recent Added Products */}
        <ReusableTable
          title="Recent Added Products"
          accentColor="bg-blue-500"
          linkLabel="View all products"
          linkUrl="/products"
          resourceName={{ singular: 'product', plural: 'products' }}
          headings={RECENT_HEADINGS}
          itemCount={RECENT_PRODUCTS.length}
          emptyStateHeading="No products added yet"
          emptyStateDescription="Connect a store to import products."
          emptyStateAction={{ content: 'Connect a Store', url: '/settings' }}
        >
          {RECENT_PRODUCTS.map(({ id, initials, color, product, vendor, price, status }, index) => (
            <IndexTable.Row id={id} key={id} position={index}>
              <IndexTable.Cell>
                <div className={color + ' w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold'}>
                  {initials}
                </div>
              </IndexTable.Cell>
              <IndexTable.Cell>
                <Text as="span" variant="bodyMd" fontWeight="semibold">{product}</Text>
              </IndexTable.Cell>
              <IndexTable.Cell>
                <Text as="span" variant="bodySm">{vendor}</Text>
              </IndexTable.Cell>
              <IndexTable.Cell>
                <Text as="span" variant="bodyMd" fontWeight="semibold">{price}</Text>
              </IndexTable.Cell>
              <IndexTable.Cell>
                <Badge tone={status === 'Active' ? 'success' : 'enabled'}>
                  {status}
                </Badge>
              </IndexTable.Cell>
            </IndexTable.Row>
          ))}
        </ReusableTable>

      </BlockStack>
    </Page>
  )
}