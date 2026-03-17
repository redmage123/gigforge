import { createContext, useState, useContext, useEffect, lazy, Suspense } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import './App.css'

import Layout from './components/Layout'
import Login from './pages/Login'
import Register from './pages/Register'
import { ToastProvider } from './components/Toast'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const Technical = lazy(() => import('./pages/Technical'))
const Blockchain = lazy(() => import('./pages/Blockchain'))
const Analytics = lazy(() => import('./pages/Analytics'))
const Portfolio = lazy(() => import('./pages/Portfolio'))
const Wallet = lazy(() => import('./pages/Wallet'))
const Alerts = lazy(() => import('./pages/Alerts'))
const Trades = lazy(() => import('./pages/Trades'))
const Tax = lazy(() => import('./pages/Tax'))
const DeFi = lazy(() => import('./pages/DeFi'))
const Whales = lazy(() => import('./pages/Whales'))
const DCA = lazy(() => import('./pages/DCA'))
const Gas = lazy(() => import('./pages/Gas'))
const NFTs = lazy(() => import('./pages/NFTs'))
const Exchanges = lazy(() => import('./pages/Exchanges'))
const ChangePassword = lazy(() => import('./pages/ChangePassword'))
const TokenApprovals = lazy(() => import('./pages/TokenApprovals'))
const Staking = lazy(() => import('./pages/Staking'))
const Airdrops = lazy(() => import('./pages/Airdrops'))
const OnchainPnL = lazy(() => import('./pages/OnchainPnL'))
const ImpermanentLoss = lazy(() => import('./pages/ImpermanentLoss'))
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
const Mempool = lazy(() => import('./pages/Mempool'))
const TokenUnlocks = lazy(() => import('./pages/TokenUnlocks'))
const Backtest = lazy(() => import('./pages/Backtest'))
const Yields = lazy(() => import('./pages/Yields'))
const DcaPlans = lazy(() => import('./pages/DcaPlans'))
const CopyTrading = lazy(() => import('./pages/CopyTrading'))
const Governance = lazy(() => import('./pages/Governance'))
const DevActivity = lazy(() => import('./pages/DevActivity'))
const WalletHealth = lazy(() => import('./pages/WalletHealth'))
const RugPullDetector = lazy(() => import('./pages/RugPullDetector'))
const Multisig = lazy(() => import('./pages/Multisig'))
const AiPortfolioBuilder = lazy(() => import('./pages/AiPortfolioBuilder'))
const PatternRecognition = lazy(() => import('./pages/PatternRecognition'))
const RegulatoryMonitor = lazy(() => import('./pages/RegulatoryMonitor'))
const TradingCoach = lazy(() => import('./pages/TradingCoach'))
const TelegramSetup = lazy(() => import('./pages/TelegramSetup'))
const CsvImport = lazy(() => import('./pages/CsvImport'))
const SharePortfolio = lazy(() => import('./pages/SharePortfolio'))
const SetupWizard = lazy(() => import('./pages/SetupWizard'))
const DataExport = lazy(() => import('./pages/DataExport'))
const Billing = lazy(() => import('./pages/Billing'))
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
    fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {})
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
              <Route path="blockchain" element={<Blockchain />} />
              <Route path="analytics" element={<Analytics />} />
              <Route path="portfolio" element={<Portfolio />} />
              <Route path="wallet" element={<Wallet />} />
              <Route path="alerts" element={<Alerts />} />
              <Route path="trades" element={<Trades />} />
              <Route path="tax" element={<Tax />} />
              <Route path="defi" element={<DeFi />} />
              <Route path="whales" element={<Whales />} />
              <Route path="dca" element={<DCA />} />
              <Route path="gas" element={<Gas />} />
              <Route path="nfts" element={<NFTs />} />
              <Route path="exchanges" element={<Exchanges />} />
              <Route path="change-password" element={<ChangePassword />} />
              <Route path="token-approvals" element={<TokenApprovals />} />
              <Route path="staking" element={<Staking />} />
              <Route path="airdrops" element={<Airdrops />} />
              <Route path="onchain-pnl" element={<OnchainPnL />} />
              <Route path="impermanent-loss" element={<ImpermanentLoss />} />
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
              <Route path="mempool" element={<Mempool />} />
              <Route path="token-unlocks" element={<TokenUnlocks />} />
              <Route path="backtest" element={<Backtest />} />
              <Route path="yields" element={<Yields />} />
              <Route path="dca-plans" element={<DcaPlans />} />
              <Route path="copy-trading" element={<CopyTrading />} />
              <Route path="governance" element={<Governance />} />
              <Route path="dev-activity" element={<DevActivity />} />
              <Route path="wallet-health" element={<WalletHealth />} />
              <Route path="rugpull" element={<RugPullDetector />} />
              <Route path="multisig" element={<Multisig />} />
              <Route path="ai-portfolio" element={<AiPortfolioBuilder />} />
              <Route path="pattern-recognition" element={<PatternRecognition />} />
              <Route path="regulatory" element={<RegulatoryMonitor />} />
              <Route path="trading-coach" element={<TradingCoach />} />
              <Route path="telegram-setup" element={<TelegramSetup />} />
              <Route path="csv-import" element={<CsvImport />} />
              <Route path="share-portfolio" element={<SharePortfolio />} />
              <Route path="setup-wizard" element={<SetupWizard />} />
              <Route path="data-export" element={<DataExport />} />
              <Route path="billing" element={<Billing />} />
              <Route path="converter" element={<Converter />} />
              <Route path="api-keys" element={<ApiKeys />} />
              <Route path="memory" element={<Memory />} />
              <Route path="search" element={<Search />} />
              <Route path="coin/:coinId" element={<CoinDetail />} />
            </Route>
          </Routes>
        </Suspense>
      </ToastProvider>
    </AuthContext.Provider>
  )
}

export default App
