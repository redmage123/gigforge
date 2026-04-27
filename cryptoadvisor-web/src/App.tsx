import { createBrowserRouter } from 'react-router'
import AppLayout from './components/layout/AppLayout'
import Dashboard    from './pages/Dashboard'
import Portfolio    from './pages/Portfolio'
import Charts       from './pages/Charts'
import Signals      from './pages/Signals'
import Alerts       from './pages/Alerts'
import Transactions from './pages/Transactions'
import Watchlist    from './pages/Watchlist'

export const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { index: true,           element: <Dashboard /> },
      { path: '/portfolio',    element: <Portfolio /> },
      { path: '/charts',       element: <Charts /> },
      { path: '/signals',      element: <Signals /> },
      { path: '/alerts',       element: <Alerts /> },
      { path: '/transactions', element: <Transactions /> },
      { path: '/watchlist',    element: <Watchlist /> },
      {
        path: '*',
        element: (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <p className="text-5xl font-bold text-text-muted mb-3">404</p>
            <p className="text-text-secondary">Page not found.</p>
          </div>
        ),
      },
    ],
  },
])
