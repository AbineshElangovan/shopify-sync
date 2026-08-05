import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import Image from 'next/image';
import Link from 'next/link';
import './globals.css';
import ShopifyProvider from '@/components/providers/AppBridgeProvider';
import { Suspense } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { ResponsiveLayout } from '@/components/layout/ResponsiveLayout';
import Script from 'next/script';
import { prisma } from '@/lib/db/prisma';
import { TimezoneProvider } from '@/components/providers/TimezoneContext';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'StoreBridge',
  description: 'Multi-store inventory synchronization',
};

const FOOTER_LINKS = [
  { href: '/', label: 'Dashboard' },
  { href: '/products', label: 'Products' },
  { href: '/sync', label: 'Sync' },
  { href: '/settings', label: 'Settings' },
];

const BUSINESS_HOURS = [
  { day: 'Monday — Friday', hours: '10:00 AM – 6:00 PM', closed: false },
  { day: 'Saturday', hours: '12:00 PM – 6:00 PM', closed: false },
  { day: 'Sunday', hours: 'Holiday', closed: true },
];

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const activeStores = await prisma.store.findMany({ where: { isActive: true } });
  
  const masterStore = activeStores.find(s => s.isMaster);
  const masterLabel = masterStore ? (masterStore.masterLabel || masterStore.shopDomain) : 'Not Configured';

  let connectedCount = 0;
  if (masterStore) {
    const connections = await (prisma as any).storeConnection.findMany({
      where: { sourceStoreId: masterStore.id }
    });
    
    // Count master store + connected target stores
    const connectedStoreIds = [masterStore.id, ...connections.map((c: any) => c.targetStoreId)];
    
    connectedCount = activeStores.filter(s => {
      if (!connectedStoreIds.includes(s.id)) return false;
      
      const token = s.accessToken;
      if (!token) return false;
      const normalized = token.trim();
      if (!normalized) return false;
      if (/mock|placeholder|your[_-]?token|seed/i.test(normalized)) return false;
      return normalized.startsWith('shp');
    }).length;
  }

  return (
    <html lang="en">
      <head>
        <meta name="shopify-api-key" content={process.env.NEXT_PUBLIC_SHOPIFY_API_KEY} />
      </head>
      <body className={inter.className}>
        <ShopifyProvider>
          <ResponsiveLayout sidebar={
            <Suspense fallback={<div className="w-[260px] bg-white border-r h-full animate-pulse" />}>
              <Sidebar />
            </Suspense>
          }>
            <TimezoneProvider>
              {children}
            </TimezoneProvider>
          </ResponsiveLayout>
        </ShopifyProvider>
      </body>
    </html>
  );
}
