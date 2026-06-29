
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import Link from 'next/link'
import Image from 'next/image'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Shopify Inventory Sync',
  description: 'Multi-store inventory synchronization',
}

const NAV_LINKS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/products',  label: 'Products'  },
  { href: '/sync',      label: 'Sync'      },
  { href: '/logs',      label: 'Logs'      },
  { href: '/settings',  label: 'Settings'  },
]

const BUSINESS_HOURS = [
  { day: 'Monday — Friday', hours: '10:00 AM – 6:00 PM', closed: false },
  { day: 'Saturday',        hours: '12:00 PM – 6:00 PM', closed: false },
  { day: 'Sunday',          hours: 'Holiday',             closed: true  },
]

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>

      
        <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">

       
              <Link href="/" className="flex items-center gap-3 shrink-0">
                <Image
                  src="/logo.png"
                  alt="InventorySync logo"
                  width={75}
                  height={75}
                  className="rounded-lg"
                />
               <span className="text-lg font-semibold text-gray-900">ESHAN InventorySync</span>
              </Link>

              <nav className="flex items-center gap-1">
                {NAV_LINKS.map(({ href, label }) => (
                  <Link
                    key={href}
                    href={href}
                    className="px-4 py-2 text-sm font-medium text-gray-600 rounded-lg hover:bg-gray-100 hover:text-gray-900 transition-colors"
                  >
                    {label}
                  </Link>
                ))}
              </nav>

            </div>
          </div>
        </header>

        <main className="min-h-screen bg-gray-50">
          {children}
        </main>

        <footer className="bg-gray-900 text-gray-300">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-10">

          
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <Image
                    src="/logo.png"
                    alt="InventorySync logo"
                    width={32}
                    height={32}
                    className="rounded-lg"
                  />
                  <span className="text-white text-lg font-semibold">InventorySync</span>
                </div>
                <p className="text-sm text-gray-400 leading-relaxed">
                  Automatically keep inventory levels identical across all your Shopify stores in real time, without manual work.
                </p>
              </div>
              <div className="flex flex-col gap-4">
                <h3 className="text-white text-sm font-semibold uppercase tracking-wider">Contact Us</h3>
                <ul className="flex flex-col gap-3 text-sm text-gray-400">
                  <li className="flex items-start gap-3">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 mt-0.5 shrink-0 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a2 2 0 01-2.828 0L6.343 16.657a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <span>123 Commerce Street, Suite 400<br />San Francisco, CA 94103</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 shrink-0 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                    <a href="tel:+14155550123" className="hover:text-white transition-colors">+1 (415) 555-0123</a>
                  </li>
                  <li className="flex items-center gap-3">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 shrink-0 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    <a href="mailto:support@inventorysync.com" className="hover:text-white transition-colors">support@inventorysync.com</a>
                  </li>
                </ul>
              </div>
              <div className="flex flex-col gap-4">
                <h3 className="text-white text-sm font-semibold uppercase tracking-wider">Business Hours</h3>
                <ul className="flex flex-col gap-2 text-sm">
                  {BUSINESS_HOURS.map(({ day, hours, closed }) => (
                    <li
                      key={day}
                      className="flex items-center justify-between py-2 border-b border-gray-700 last:border-0"
                    >
                      <span className="text-gray-400">{day}</span>
                      <span className={closed ? 'text-red-400 font-medium' : 'text-white font-medium'}>
                        {hours}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

            </div>

            {/* Bottom Bar */}
            <div className="mt-10 pt-6 border-t border-gray-700 flex flex-col sm:flex-row items-center justify-between gap-4">
              <p className="text-xs text-gray-500">
                © {new Date().getFullYear()} InventorySync. All rights reserved.
              </p>
              <nav className="flex items-center gap-6">
                {NAV_LINKS.map(({ href, label }) => (
                  <Link
                    key={href}
                    href={href}
                    className="text-xs text-gray-500 hover:text-white transition-colors"
                  >
                    {label}
                  </Link>
                ))}
              </nav>
            </div>

          </div>
        </footer>

      </body>
    </html>
  )
}
