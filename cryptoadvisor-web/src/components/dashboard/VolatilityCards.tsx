/**
 * Dashboard hero cards for ATR(14) and 30-day annualized realized volatility
 * (STORY-906). Wired into Dashboard.tsx alongside the existing StatCards.
 */
import { useMemo } from 'react'
import { atr, realizedVol } from '../../utils/indicators'
import StatCard from '../ui/StatCard'
import type { OHLCVCandle } from '../../types/index'

interface VolatilityCardsProps {
  candles: OHLCVCandle[]
}

export default function VolatilityCards({ candles }: VolatilityCardsProps) {
  const stats = useMemo(() => {
    const atrSeries = atr(candles, 14)
    const closes = candles.map((c) => c.close)
    const rvSeries = realizedVol(closes, 30)
    const lastDefined = (s: (number | null)[]): number | null => {
      for (let i = s.length - 1; i >= 0; i--) {
        if (s[i] !== null) return s[i]
      }
      return null
    }
    return {
      atr: lastDefined(atrSeries),
      rv: lastDefined(rvSeries),
    }
  }, [candles])

  const atrFormatted =
    stats.atr === null
      ? '—'
      : new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(stats.atr)

  const rvFormatted = stats.rv === null ? '—' : `${(stats.rv * 100).toFixed(1)}%`

  return (
    <>
      <StatCard label="ATR (14)" value={atrFormatted} />
      <StatCard label="Realized Vol (30d, ann.)" value={rvFormatted} />
    </>
  )
}
