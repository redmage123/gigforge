import { createContext, useState, useContext, useEffect, lazy, Suspense } from 'react'
import { csrfHeader } from './api/client'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import './App.css'

import Layout from './components/Layout'
import Login from './pages/Login'
import Register from './pages/Register'
import { ToastProvider } from './components/Toast'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const Technical = lazy(() => import('./pages/Technical'))
const Portfolio = lazy(() => import('./pages/Portfolio'))
const Wallet = lazy(() => import('./pages/Wallet'))
const Alerts = lazy(() => import('./pages/Alerts'))
const Notifications = lazy(() => import('./pages/Notifications'))
const Trades = lazy(() => import('./pages/Trades'))
const Tax = lazy(() => import('./pages/Tax'))
const DCA = lazy(() => import('./pages/DCA'))
const Exchanges = lazy(() => import('./pages/Exchanges'))
const ChangePassword = lazy(() => import('./pages/ChangePassword'))
const OnchainPnL = lazy(() => import('./pages/OnchainPnL'))
const Correlation = lazy(() => import('./pages/Correlation'))
const Sentiment = lazy(() => import('./pages/Sentiment'))
const Sessions = lazy(() => import('./pages/Sessions'))
const AuditLog = lazy(() => import('./pages/AuditLog'))
const Settings = lazy(() => import('./pages/Settings'))
const AiBriefing = lazy(() => import('./pages/AiBriefing'))
const AiRiskReport = lazy(() => import('./pages/AiRiskReport'))
const AiTaxOptimizer = lazy(() => import('./pages/AiTaxOptimizer'))
const Orderbook = lazy(() => import('./pages/Orderbook'))
const Liquidations = lazy(() => import('./pages/Liquidations'))
const Backtest = lazy(() => import('./pages/Backtest'))
const DcaPlans = lazy(() => import('./pages/DcaPlans'))
const AiPortfolioBuilder = lazy(() => import('./pages/AiPortfolioBuilder'))
const PatternRecognition = lazy(() => import('./pages/PatternRecognition'))
const TradingCoach = lazy(() => import('./pages/TradingCoach'))
const TelegramSetup = lazy(() => import('./pages/TelegramSetup'))
const CsvImport = lazy(() => import('./pages/CsvImport'))
const SharePortfolio = lazy(() => import('./pages/SharePortfolio'))
const SetupWizard = lazy(() => import('./pages/SetupWizard'))
const DataExport = lazy(() => import('./pages/DataExport'))
const Converter = lazy(() => import('./pages/Converter'))
const ApiKeys = lazy(() => import('./pages/ApiKeys'))
const CoinDetail = lazy(() => import('./pages/CoinDetail'))
const Memory = lazy(() => import('./pages/Memory'))
const Search = lazy(() => import('./pages/Search'))

export const AuthContext = createContext(null)

export function useAuth() {
  return useContext(AuthContext)
}

function ProtectedRoute({ children }) {
  const { token } = useAuth()
  if (!token) {
    return <Navigate to="/login" replace />
  }
  return children
}

function App() {
  const [token, setToken] = useState(() => localStorage.getItem('token'))
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('user')) } catch { return null }
  })

  useKeyboardShortcuts()

  // Always refresh user data from server on mount to pick up profile changes
  useEffect(() => {
    if (token) {
      fetch('/api/auth/me', { credentials: 'include' })
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (data?.username) {
            setUser(data)
            localStorage.setItem('user', JSON.stringify(data))
          }
        })
        .catch(() => {})
    }
  }, [])

  useEffect(() => {
    if (token) {
      localStorage.setItem('token', token)
    } else {
      localStorage.removeItem('token')
    }
  }, [token])

  const login = (newToken, userData) => {
    setToken(newToken)
    setUser(userData)
    localStorage.setItem('user', JSON.stringify(userData))
  }

  const logout = () => {
    setToken(null)
    setUser(null)
    localStorage.removeItem('user')
    fetch('/api/auth/logout', { method: 'POST', credentials: 'include', headers: csrfHeader() }).catch(() => {})
  }

  return (
    <AuthContext.Provider value={{ token, user, login, logout }}>
      <ToastProvider>
        <Suspense fallback={<div className="loading-spinner"><div className="spinner" /></div>}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
              <Route index element={<Dashboard />} />
              <Route path="technical" element={<Technical />} />
              <Route path="portfolio" element={<Portfolio />} />
              <Route path="wallet" element={<Wallet />} />
              <Route path="alerts" element={<Alerts />} />
              <Route path="notifications" element={<Notifications />} />
              <Route path="trades" element={<Trades />} />
              <Route path="tax" element={<Tax />} />
              <Route path="dca" element={<DCA />} />
              <Route path="exchanges" element={<Exchanges />} />
              <Route path="change-password" element={<ChangePassword />} />
              <Route path="onchain-pnl" element={<OnchainPnL />} />
              <Route path="correlation" element={<Correlation />} />
              <Route path="sentiment" element={<Sentiment />} />
              <Route path="sessions" element={<Sessions />} />
              <Route path="audit-log" element={<AuditLog />} />
              <Route path="settings" element={<Settings />} />
              <Route path="ai-briefing" element={<AiBriefing />} />
              <Route path="ai-risk" element={<AiRiskReport />} />
              <Route path="ai-tax" element={<AiTaxOptimizer />} />
              <Route path="orderbook" element={<Orderbook />} />
              <Route path="liquidations" element={<Liquidations />} />
              <Route path="backtest" element={<Backtest />} />
              <Route path="dca-plans" element={<DcaPlans />} />
              <Route path="ai-portfolio" element={<AiPortfolioBuilder />} />
              <Route path="pattern-recognition" element={<PatternRecognition />} />
              <Route path="trading-coach" element={<TradingCoach />} />
              <Route path="telegram-setup" element={<TelegramSetup />} />
              <Route path="csv-import" element={<CsvImport />} />
              <Route path="share-portfolio" element={<SharePortfolio />} />
              <Route path="setup-wizard" element={<SetupWizard />} />
              <Route path="data-export" element={<DataExport />} />
              <Route path="converter" element={<Converter />} />
              <Route path="api-keys" element={<ApiKeys />} />
              <Route path="memory" element={<Memory />} />
              <Route path="search" element={<Search />} />
              <Route path="coin/:coinId" element={<CoinDetail />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </Suspense>
      </ToastProvider>
    </AuthContext.Provider>
  )
}

export default App
