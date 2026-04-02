import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import Sidebar from '@/components/Sidebar'
import CookieConsentBanner from '@/components/CookieConsentBanner'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'GigForge | AI-Powered Development Agency',
  description: 'Describe what you need. Our autonomous AI team designs, codes, tests, and ships it — with human approval at every gate.',
  metadataBase: new URL('https://gigforge.ai'),
  openGraph: {
    type: 'website',
    url: 'https://gigforge.ai',
    siteName: 'GigForge',
    title: 'GigForge | AI-Powered Development Agency',
    description: 'Describe what you need. Our autonomous AI team designs, codes, tests, and ships it — with human approval at every gate.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'GigForge | AI-Powered Development Agency',
    description: 'Describe what you need. Our autonomous AI team designs, codes, tests, and ships it — with human approval at every gate.',
  },
  icons: {
    icon: '/favicon.svg',
  },
  themeColor: '#ffffff',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head />
      <body className="min-h-screen flex flex-col bg-white text-text-primary">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 bg-gold text-white px-4 py-2 rounded z-50"
        >
          Skip to main content
        </a>
        <Header />
        <div className="flex flex-1">
          <Sidebar />
          <main id="main" className="flex-1">
            {children}
          </main>
        </div>
        <Footer />
        <CookieConsentBanner />
      </body>
    </html>
  )
}
