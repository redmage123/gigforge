// Shared TypeScript interfaces for CryptoAdvisor Web Dashboard

export interface Holding {
  asset: string
  symbol: string
  amount: number
  avgBuyPrice: number
  currentPrice: number
  value: number
  allocationPct: number
  pnl: number
  pnlPct: number
  sparkline: number[]
}

export interface Portfolio {
  totalValue: number
  change24h: number
  changePct24h: number
  holdings: Holding[]
  sparkline: number[]
}

export interface OHLCVCandle {
  timestamp: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export type Asset = 'BTC' | 'ETH' | 'SOL' | 'ADA'
export type Timeframe = '1D' | '1W' | '1M'

export interface PriceData {
  asset: Asset
  timeframe: Timeframe
  candles: OHLCVCandle[]
}

export type Direction = 'BUY' | 'SELL' | 'HOLD'

export interface Signal {
  id: string
  asset: string
  direction: Direction
  confidence: number
  reason: string
  timestamp: string
  /** Sprint 8 STORY-807: alias for the CMS field `assetSymbol`. */
  assetSymbol?: string
  /** Sprint 8 STORY-807: human asset name (e.g. "Bitcoin"); CMS-provided. */
  assetName?: string
  /** Sprint 8 STORY-807: alias for the CMS field `generatedAt`. */
  generatedAt?: string
}

export type AlertCondition = 'above' | 'below'

export interface Alert {
  id: string
  asset: string
  condition: AlertCondition
  threshold: number
  currentPrice: number
  triggered: boolean
  createdAt: string
}

export type TransactionType = 'BUY' | 'SELL'
export type TransactionStatus = 'completed' | 'pending' | 'failed'

export interface Transaction {
  id: string
  date: string
  asset: string
  symbol: string
  type: TransactionType
  amount: number
  price: number
  total: number
  status: TransactionStatus
}

export interface WatchlistItem {
  asset: string
  symbol: string
  currentPrice: number
  change24h: number
  changePct24h: number
  sparkline: number[]
}

// Chart colour constants (SVG does not inherit CSS custom properties)
export const CHART_COLORS = {
  positive: '#22c55e',
  negative: '#ef4444',
  neutral: '#f59e0b',
  accent: '#3b82f6',
  grid: '#2a2e39',
  text: '#94a3b8',
  surface: '#131722',
  elevated: '#1c2030',
  assets: [
    '#3b82f6', // BTC
    '#10b981', // ETH
    '#f59e0b', // SOL
    '#8b5cf6', // ADA
    '#06b6d4',
    '#f43f5e',
  ],
} as const
