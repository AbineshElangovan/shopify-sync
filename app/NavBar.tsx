'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_LINKS = [
  { href: '/',         label: 'Dashboard' },
  { href: '/products', label: 'Products'  },
  { href: '/sync',     label: 'Sync'      },
  { href: '/settings', label: 'Settings'  },
];

export default function NavBar() {
  const pathname = usePathname();

  return (
    <>
      {/* Desktop nav */}
      <nav className="hidden md:flex items-center gap-1">
        {NAV_LINKS.map(({ href, label }) => {
          const isActive = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
                isActive
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-gray-300 hover:bg-gray-700 hover:text-white'
              }`}
            >
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Mobile placeholder */}
      <div className="md:hidden flex items-center">
        <span className="text-gray-400 text-sm">Menu</span>
      </div>
    </>
  );
}
