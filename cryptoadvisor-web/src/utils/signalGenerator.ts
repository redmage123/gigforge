/**
 * Donchian breakout signal generator (Sprint 9, STORY-907).
 *
 * Closes the loop between the Signals UI and real indicator math: emits a
 * BUY signal when close crosses above the prior 20-day high, SELL when it
 * crosses below the prior 20-day low. Generated signals carry
 * `source: 'donchian'` so the UI can distinguish them from CMS-curated
 * editorial signals.
 *
 * The "prior" period exclusion matters: the channel for day t uses highs
 * and lows from days [t-period, t-1]; using day t in its own channel
 * would prevent a breakout from ever firing.
 */

import type { OHLCVCandle } from '../types/index'

export type SignalAction = 'BUY' | 'SELL'

export interface GeneratedSignal {
  id: string
  symbol: string
  action: SignalAction
  /** Closing price at signal time. */
  price: number
  /** Channel level that was crossed (the prior 20-day high for BUY, low for SELL). */
  level: number
  /** Epoch ms of the candle close that triggered the signal. */
  timestamp: number
  /** Always 'donchian' for now; reserved for future generators. */
  source: 'donchian'
  /** Index in the input candle array — useful for chart annotations. */
  index: number
}

export interface DonchianSignalOptions {
  symbol: string
  period?: number
}

export function generateDonchianSignals(
  candles: OHLCVCandle[],
  opts: DonchianSignalOptions,
): GeneratedSignal[] {
  const { symbol, period = 20 } = opts
  const out: GeneratedSignal[] = []
  if (candles.length <= period) return out

  for (let i = period; i < candles.length; i++) {
    let priorHigh = -Infinity
    let priorLow = Infinity
    for (let j = i - period; j < i; j++) {
      if (candles[j].high > priorHigh) priorHigh = candles[j].high
      if (candles[j].low < priorLow) priorLow = candles[j].low
    }
    const close = candles[i].close
    if (close > priorHigh) {
      out.push({
        id: `donchian-${symbol}-${candles[i].timestamp}`,
        symbol,
        action: 'BUY',
        price: close,
        level: priorHigh,
        timestamp: candles[i].timestamp,
        source: 'donchian',
        index: i,
      })
    } else if (close < priorLow) {
      out.push({
        id: `donchian-${symbol}-${candles[i].timestamp}`,
        symbol,
        action: 'SELL',
        price: close,
        level: priorLow,
        timestamp: candles[i].timestamp,
        source: 'donchian',
        index: i,
      })
    }
  }

  return out
}


import type { Signal } from '../types/index'

/**
 * Shape a generated Donchian signal into the editorial Signal interface so
 * the existing Signals UI can render both side-by-side. Confidence is
 * derived from breakout magnitude relative to the channel level, capped
 * at 95 — a deterministic indicator should never claim >95% certainty.
 */
export function toEditorialSignal(
  generated: GeneratedSignal,
): Signal & { source: 'donchian' } {
  const magnitude = Math.abs(generated.price - generated.level) / generated.level
  const confidence = Math.min(95, Math.round(60 + magnitude * 1500))
  const verb = generated.action === 'BUY' ? 'above' : 'below'
  const levelType = generated.action === 'BUY' ? 'high' : 'low'
  return {
    id: generated.id,
    asset: generated.symbol,
    direction: generated.action,
    confidence,
    reason: `Donchian breakout — close $${generated.price.toFixed(2)} ${verb} prior 20-day ${levelType} $${generated.level.toFixed(2)}.`,
    timestamp: new Date(generated.timestamp).toISOString(),
    source: 'donchian',
  }
}
