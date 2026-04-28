import { createBrowserRouter } from 'react-router'
import AppLayout from './components/layout/AppLayout'
import ProtectedRoute from './components/auth/ProtectedRoute'
import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard    from './pages/Dashboard'
import Portfolio    from './pages/Portfolio'
import Charts       from './pages/Charts'
import Signals      from './pages/Signals'
import Alerts       from './pages/Alerts'
import Transactions from './pages/Transactions'
import Watchlist      from './pages/Watchlist'
import RiskCalculator from './pages/RiskCalculator'
import Stats          from './pages/Stats'
import Backtest       from './pages/Backtest'

export const router = createBrowserRouter([
  { path: '/login',    element: <Login /> },
  { path: '/register', element: <Register /> },
  {
    element: <ProtectedRoute><AppLayout /></ProtectedRoute>,
    children: [
      { index: true,           element: <Dashboard /> },
      { path: '/portfolio',    element: <Portfolio /> },
      { path: '/charts',       element: <Charts /> },
      { path: '/signals',      element: <Signals /> },
      { path: '/alerts',       element: <Alerts /> },
      { path: '/transactions', element: <Transactions /> },
      { path: '/watchlist',    element: <Watchlist /> },
      { path: '/risk',         element: <RiskCalculator /> },
      { path: '/stats',        element: <Stats /> },
      { path: '/backtest',     element: <Backtest /> },
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
