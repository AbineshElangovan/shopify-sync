import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import Image from 'next/image';
import Link from 'next/link';
import './globals.css';
import ShopifyProvider from '@/components/providers/AppBridgeProvider';
import { Suspense } from 'react';
import NavBar from './NavBar';
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
        <main className="min-h-screen bg-gray-50">
          <ShopifyProvider>

          
            <header
              style={{ backgroundColor: '#1a1f2e', borderBottom: '1px solid #2d3748' }}
              className="sticky top-0 z-50 shadow-lg"
            >
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between py-3">

                  <Link href="/" className="flex items-center gap-3 shrink-0">
                    <Image
                      src="/logo.png"
                      alt="InventorySync logo"
                      width={70}
                      height={70}
                      className="w-10 h-auto rounded-lg"
                    />
                    <span className="text-lg font-semibold text-white tracking-wide hidden sm:block">
                      StoreBridge
                    </span>
                  </Link>

                  <div className="flex items-center gap-6">
                    <Suspense fallback={<div className="text-gray-400 text-sm">Loading navigation...</div>}>
                      <NavBar 
                        masterLabel={masterLabel} 
                        masterDomain={masterStore?.shopDomain || ''} 
                      />
                    </Suspense>
                  </div>

                </div>
              </div>
            </header>

            <TimezoneProvider>
              {children}
            </TimezoneProvider>

           
            <footer
              style={{ backgroundColor: '#1a1f2e', borderTop: '1px solid #2d3748' }}
              className="text-gray-300 mt-16"
            >
              <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-12">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-10">

              
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-3">
                      <Image src="/logo.png" alt="StoreBridge logo" width={75} height={75} className="rounded-lg" style={{ width: '75px', height: '75px' }} />
                      <span className="text-white text-lg font-semibold">StoreBridge</span>
                    </div>
                    <p className="text-sm text-gray-400 leading-relaxed">
                      Automatically keep inventory levels identical across all your Shopify stores in real time, without manual work.
                    </p>
                  </div>

            
                  <div className="flex flex-col gap-4">
                    <h3 className="text-white text-sm font-semibold uppercase tracking-wider">Contact Us</h3>
                    <ul className="flex flex-col gap-3 text-sm text-gray-400">
                      <li className="flex items-start gap-3">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 mt-0.5 shrink-0 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a2 2 0 01-2.828 0L6.343 16.657a8 8 0 1111.314 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        <span>123 StoreBridge, Coimbatore - 641 001</span>
                      </li>
                      <li className="flex items-center gap-3">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 shrink-0 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                        </svg>
                        <a href="tel:+919876543210" className="hover:text-white transition-colors">+91 98765 43210</a>
                      </li>
                      <li className="flex items-center gap-3">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 shrink-0 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                        <a href="mailto:support@eshan-inventorysync.com" className="hover:text-white transition-colors">support@eshan-inventorysync.com</a>
                      </li>
                    </ul>
                  </div>

                 
                  <div className="flex flex-col gap-4">
                    <h3 className="text-white text-sm font-semibold uppercase tracking-wider">Business Hours</h3>
                    <ul className="flex flex-col gap-2 text-sm">
                      {BUSINESS_HOURS.map(({ day, hours, closed }) => (
                        <li key={day} className="flex items-center justify-between py-1.5 border-b border-gray-700 last:border-0">
                          <span className="text-gray-400">{day}</span>
                          <span className={closed ? 'text-red-400 font-medium' : 'text-white font-medium'}>{hours}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                </div>

                <div className="mt-10 pt-6 border-t border-gray-700 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <p className="text-xs text-gray-500">
                    © {new Date().getFullYear()} StoreBridge. All rights reserved.
                  </p>
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                      Production
                    </span>
                    <span>v2.1.0</span>
                    <span>Connected: <strong className="text-gray-300">{connectedCount} {connectedCount === 1 ? 'Store' : 'Stores'}</strong></span>
                  </div>
                </div>

              </div>
            </footer>

          </ShopifyProvider>
        </main>
      </body>
    </html>
  );
}
