
import { ArrowUpIcon, ArrowDownIcon } from '@shopify/polaris-icons'

const STATS = [
  {
    label: 'Total Products',
    value: '0',
    sub: 'No products synced yet',
    color: 'bg-blue-50 text-blue-700',
    border: 'border-blue-100',
  },
  {
    label: 'Connected Stores',
    value: '0',
    sub: 'No stores connected yet',
    color: 'bg-purple-50 text-purple-700',
    border: 'border-purple-100',
  },
  {
    label: 'Successful Syncs',
    value: '0',
    sub: 'No syncs completed yet',
    color: 'bg-green-50 text-green-700',
    border: 'border-green-100',
  },
  {
    label: 'Failed Syncs',
    value: '0',
    sub: 'No failures recorded',
    color: 'bg-red-50 text-red-700',
    border: 'border-red-100',
  },
]

const RECENT_COLUMNS = ['SKU', 'Source Store', 'Destination', 'Qty Change', 'Status', 'Time']

export default function DashboardPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">

      
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">
          Overview of your inventory synchronization activity across all connected stores.
        </p>
      </div>

   
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
        {STATS.map(({ label, value, sub, color, border }) => (
          <div key={label} className={`card border ${border} p-6 flex flex-col gap-3`}>
            <span className="text-sm font-medium text-gray-500">{label}</span>
            <span className="text-3xl font-bold text-gray-900">{value}</span>
            <span className={`text-xs font-medium px-2 py-1 rounded-md w-fit ${color}`}>
              {sub}
            </span>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Recent Sync Activity</h2>
          <a href="/logs" className="text-sm text-blue-600 hover:text-blue-700 font-medium transition-colors">
            View all logs
          </a>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {RECENT_COLUMNS.map((col) => (
                  <th key={col} className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={RECENT_COLUMNS.length} className="px-6 py-16 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                      </svg>
                    </div>
                    <p className="text-sm font-medium text-gray-500">No sync activity yet</p>
                    <p className="text-xs text-gray-400">Connect your Shopify stores to start syncing inventory.</p>
                    <a href="/settings" className="btn-primary mt-1">
                      Connect a Store
                    </a>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

    </div>
  )
}
