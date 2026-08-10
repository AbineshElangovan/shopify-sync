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
import { LiveRefresher } from '@/components/providers/LiveRefresher';
import { StoreProvider } from '@/components/providers/StoreProvider';

export const dynamic = 'force-dynamic';

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

export default function RootLayout({ children }: { children: React.ReactNode }) {

  return (
    <html lang="en">
      <head>
        <meta name="shopify-api-key" content={process.env.NEXT_PUBLIC_SHOPIFY_API_KEY} />
      </head>
      <body className={inter.className}>
        <ShopifyProvider>
          <StoreProvider>
            <ResponsiveLayout sidebar={
              <Suspense fallback={<div className="w-[260px] bg-white border-r h-full animate-pulse" />}>
                <Sidebar />
              </Suspense>
            }>
              <TimezoneProvider>
                <LiveRefresher />
                {children}
              </TimezoneProvider>
            </ResponsiveLayout>
          </StoreProvider>
        </ShopifyProvider>
      </body>
    </html>
  );
}
