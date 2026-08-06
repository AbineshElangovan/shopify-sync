'use client';
import React from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import {
  HomeIcon, ProductIcon, ImportIcon, HeartIcon,
  DiscountIcon,
  CashDollarIcon,
  SettingsIcon,
  LinkIcon,
  CodeIcon,
  ClockIcon
} from '@shopify/polaris-icons';
import { Icon } from '@shopify/polaris';

interface MenuItem {
  label: string;
  href: string;
  icon: any;
  badge?: string;
}

interface MenuSection {
  title: string;
  items: MenuItem[];
}

export function Sidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const shop = searchParams.get('shop');
  const host = searchParams.get('host');

  const createHref = (basePath: string) => {
    const queryParams = new URLSearchParams();
    if (shop) queryParams.set('shop', shop);
    if (host) queryParams.set('host', host);
    const queryString = queryParams.toString();
    return queryString ? `${basePath}?${queryString}` : basePath;
  };

  const menuSections: MenuSection[] = [
    {
      title: 'OVERVIEW',
      items: [
        { label: 'Dashboard', href: '/', icon: HomeIcon },
        { label: 'Activity', href: '/activity', icon: ClockIcon },
      ]
    },
    {
      title: 'CATALOG',
      items: [
        { label: 'Products', href: '/products', icon: ProductIcon },
        { label: 'Import & Sync', href: '/sync', icon: ImportIcon },
        { label: 'Catalog health', href: '#', icon: HeartIcon },
      ]
    },
    {
      title: 'RULES',
      items: [
        { label: 'SKU generation', href: '/sku', icon: DiscountIcon },
        { label: 'Price adjustment', href: '#', icon: CashDollarIcon },
        { label: 'Store connections', href: '/connections', icon: LinkIcon },
        { label: 'Settings', href: '/settings', icon: SettingsIcon },
      ]
    },
    {
      title: 'RESOURCES',
      items: [
        { label: 'Developer docs', href: '#', icon: CodeIcon },
      ]
    }
  ];

  return (
    <div className="w-[260px] flex-shrink-0 border-r border-[#0db69d]/10 bg-[#f0fdfa] h-screen sticky top-0 flex flex-col">
      {/* Brand */}
      <div className="px-6 py-6 flex items-center gap-3">
        <Image src="/logo.png" alt="Logo" width={32} height={32} className='rounded-lg' />
        <div>
          <h2 className="text-[15px] font-bold text-gray-900 leading-tight">StoreBridge</h2>
          <p className="text-[11px] text-gray-500 leading-tight">Multi-store inventory sync</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-scroll px-4 pb-6 ys-sidebar-scroll">
        {menuSections.map((section, idx) => (
          <div key={idx} className="mb-6">
            <h3 className="px-3 mb-2 text-[11px] font-bold text-gray-500 tracking-wider uppercase">
              {section.title}
            </h3>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.label}
                    href={createHref(item.href)}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors group ${isActive
                      ? 'bg-[#e0f8f5] text-[#0b9c86] font-semibold'
                      : 'text-gray-600 hover:bg-[#0db69d] hover:text-white font-medium'
                      }`}
                  >
                    <span className={isActive ? 'text-[#0b9c86]' : 'text-gray-400 group-hover:text-white transition-colors'}>
                      <Icon source={item.icon} tone="inherit" />
                    </span>
                    {item.label}
                    {item.badge && (
                      <span className="ml-auto bg-blue-100 text-blue-700 py-0.5 px-2 rounded-full text-xs font-medium">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
