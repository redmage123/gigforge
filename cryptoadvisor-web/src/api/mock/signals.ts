import type { Signal } from '../../types/index'

const MOCK_SIGNALS: Signal[] = [
  {
    id: 'sig-001',
    asset: 'BTC',
    direction: 'BUY',
    confidence: 87,
    reason: 'Strong support at $43k, RSI oversold on 4h timeframe, golden cross forming',
    timestamp: '2026-03-22T14:30:00Z',
  },
  {
    id: 'sig-002',
    asset: 'ETH',
    direction: 'BUY',
    confidence: 74,
    reason: 'EIP upgrade catalyst, accumulation pattern on daily chart',
    timestamp: '2026-03-22T13:15:00Z',
  },
  {
    id: 'sig-003',
    asset: 'SOL',
    direction: 'SELL',
    confidence: 68,
    reason: 'Overbought RSI at 78, resistance at $145 zone, profit-taking recommended',
    timestamp: '2026-03-22T12:00:00Z',
  },
  {
    id: 'sig-004',
    asset: 'ADA',
    direction: 'HOLD',
    confidence: 55,
    reason: 'Consolidation phase, waiting for breakout confirmation above $0.55',
    timestamp: '2026-03-22T10:45:00Z',
  },
  {
    id: 'sig-005',
    asset: 'BTC',
    direction: 'HOLD',
    confidence: 62,
    reason: 'Range-bound between $43k-$45k, no clear directional bias short-term',
    timestamp: '2026-03-22T09:30:00Z',
  },
  {
    id: 'sig-006',
    asset: 'ETH',
    direction: 'SELL',
    confidence: 71,
    reason: 'Double top pattern at $3,250, bearish divergence on MACD',
    timestamp: '2026-03-22T08:15:00Z',
  },
  {
    id: 'sig-007',
    asset: 'SOL',
    direction: 'BUY',
    confidence: 82,
    reason: 'Institutional accumulation detected, on-chain metrics bullish',
    timestamp: '2026-03-22T07:00:00Z',
  },
  {
    id: 'sig-008',
    asset: 'ADA',
    direction: 'SELL',
    confidence: 59,
    reason: 'Weak volume on recent rally, distribution pattern forming',
    timestamp: '2026-03-22T05:30:00Z',
  },
]

export async function getSignals(): Promise<Signal[]> {
  await new Promise((r) => setTimeout(r, 150))
  return MOCK_SIGNALS
}
