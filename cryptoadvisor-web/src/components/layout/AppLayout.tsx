import { useState, useEffect } from 'react'
import { Outlet, useLocation } from 'react-router'
import Sidebar from './Sidebar'
import Header from './Header'
import MobileNav from './MobileNav'

const PAGE_TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/portfolio': 'Portfolio',
  '/charts': 'Charts',
  '/signals': 'Signals',
  '/alerts': 'Alerts',
  '/transactions': 'Transactions',
  '/watchlist': 'Watchlist',
}

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()
  const pageTitle = PAGE_TITLES[location.pathname] ?? 'CryptoAdvisor'

  // Close sidebar on route change
  useEffect(() => {
    setSidebarOpen(false)
  }, [location.pathname])

  // Update document title on route change
  useEffect(() => {
    document.title = `${pageTitle} — CryptoAdvisor`
  }, [pageTitle])

  return (
    <div className="flex h-screen bg-bg-base overflow-hidden">
      {/* Desktop sidebar */}
      <div className="hidden lg:flex w-60 flex-shrink-0">
        <Sidebar />
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/60"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
          {/* Sidebar panel */}
          <div className="relative w-60 flex-shrink-0 z-10">
            <Sidebar onClose={() => setSidebarOpen(false)} />
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header title={pageTitle} onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6 bg-bg-base">
          <Outlet />
        </main>
        <MobileNav />
      </div>
    </div>
  )
}
