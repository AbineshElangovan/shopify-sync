'use client';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

const NAV_LINKS = [
  { href: '/', label: 'Dashboard' },
  { href: '/products', label: 'Products' },
  { href: '/sync', label: 'Sync' },
  { href: '/settings', label: 'Settings' },
];

export default function NavBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const shop = searchParams.get('shop');
  const host = searchParams.get('host');

  return (
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
  );
}
