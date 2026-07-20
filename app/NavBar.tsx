'use client';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

const NAV_LINKS = [
  { href: '/', label: 'Dashboard' },
  { href: '/products', label: 'Products' },
  { href: '/sync', label: 'Sync' },
  { href: '/settings', label: 'Settings' },
];

export default function NavBar({ masterLabel, masterDomain }: { masterLabel?: string; masterDomain?: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const shop = searchParams.get('shop');
  const host = searchParams.get('host');

  const isMaster = shop === masterDomain;

  return (
    <div className="flex items-center gap-6">
      <nav className="flex items-center gap-1">
        {NAV_LINKS.map(({ href, label }) => {
          const isActive = pathname === href;
          const queryParams = new URLSearchParams();
          if (shop) queryParams.set('shop', shop);
          if (host) queryParams.set('host', host);
          const queryString = queryParams.toString();
          const fullHref = queryString ? `${href}?${queryString}` : href;

          return (
            <Link
              key={href}
              href={fullHref}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 ${isActive
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                }`}
            >
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Dynamic Store Badge */}
      {masterDomain && (
        <div className="hidden md:flex items-center">
          {isMaster ? (
            <div className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-1.5 rounded-full shadow-md">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
              <span className="text-indigo-200 text-xs font-semibold uppercase tracking-wider">Source:</span>
              <span className="text-white text-sm font-bold">Master</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-1.5 rounded-full shadow-md">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              <span className="text-indigo-200 text-xs font-semibold uppercase tracking-wider">Destination:</span>
              <span className="text-white text-sm font-bold">Sub-store</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
