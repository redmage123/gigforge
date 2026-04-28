/**
 * Technical-analysis indicator service (Sprint 9, STORY-901).
 *
 * All functions are pure: given the same inputs, they produce the same
 * outputs with no I/O, no side-effects, and no dependencies. Output arrays
 * are aligned to the input array — leading values that don't have enough
 * history to compute are returned as `null` so consumers can skip them
 * without losing index alignment with timestamps.
 *
 * Reference values validated against TA-Lib defaults (see indicators.test.ts).
 */

import type { OHLCVCandle } from '../types/index'

export type Series = (number | null)[]

// ---------- Simple / Exponential moving averages ----------

export function sma(values: number[], period: number): Series {
  if (period <= 0) throw new Error('sma: period must be > 0')
  const out: Series = new Array(values.length).fill(null)
  let sum = 0
  for (let i = 0; i < values.length; i++) {
    sum += values[i]
    if (i >= period) sum -= values[i - period]
    if (i >= period - 1) out[i] = sum / period
  }
  return out
}

export function ema(values: number[], period: number): Series {
  if (period <= 0) throw new Error('ema: period must be > 0')
  const out: Series = new Array(values.length).fill(null)
  if (values.length < period) return out
  const k = 2 / (period + 1)
  // Seed with SMA of the first `period` values, per the canonical recipe.
  let seed = 0
  for (let i = 0; i < period; i++) seed += values[i]
  let prev = seed / period
  out[period - 1] = prev
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k)
    out[i] = prev
  }
  return out
}

// ---------- RSI (Wilder's smoothing) ----------

export function rsi(values: number[], period = 14): Series {
  if (period <= 0) throw new Error('rsi: period must be > 0')
  const out: Series = new Array(values.length).fill(null)
  if (values.length <= period) return out

  let gainSum = 0
  let lossSum = 0
  for (let i = 1; i <= period; i++) {
    const diff = values[i] - values[i - 1]
    if (diff >= 0) gainSum += diff
    else lossSum -= diff
  }
  let avgGain = gainSum / period
  let avgLoss = lossSum / period
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)

  for (let i = period + 1; i < values.length; i++) {
    const diff = values[i] - values[i - 1]
    const gain = diff > 0 ? diff : 0
    const loss = diff < 0 ? -diff : 0
    avgGain = (avgGain * (period - 1) + gain) / period
    avgLoss = (avgLoss * (period - 1) + loss) / period
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
  }

  return out
}

// ---------- MACD (12, 26, 9) ----------

export interface MacdResult {
  macd: Series
  signal: Series
  histogram: Series
}

export function macd(
  values: number[],
  fast = 12,
  slow = 26,
  signalPeriod = 9,
): MacdResult {
  const fastEma = ema(values, fast)
  const slowEma = ema(values, slow)
  const macdLine: Series = values.map((_, i) => {
    const f = fastEma[i]
    const s = slowEma[i]
    return f !== null && s !== null ? f - s : null
  })
  const macdNumeric: number[] = []
  const macdIndices: number[] = []
  for (let i = 0; i < macdLine.length; i++) {
    if (macdLine[i] !== null) {
      macdIndices.push(i)
      macdNumeric.push(macdLine[i] as number)
    }
  }
  const signalDense = ema(macdNumeric, signalPeriod)
  const signalLine: Series = new Array(values.length).fill(null)
  for (let j = 0; j < signalDense.length; j++) {
    const sig = signalDense[j]
    if (sig !== null) signalLine[macdIndices[j]] = sig
  }
  const histogram: Series = values.map((_, i) => {
    const m = macdLine[i]
    const s = signalLine[i]
    return m !== null && s !== null ? m - s : null
  })
  return { macd: macdLine, signal: signalLine, histogram }
}

// ---------- Bollinger Bands (period=20, k=2) ----------

export interface BollingerResult {
  upper: Series
  middle: Series
  lower: Series
  bandwidth: Series // (upper - lower) / middle
}

export function bollinger(values: number[], period = 20, k = 2): BollingerResult {
  const middle = sma(values, period)
  const upper: Series = new Array(values.length).fill(null)
  const lower: Series = new Array(values.length).fill(null)
  const bandwidth: Series = new Array(values.length).fill(null)
  for (let i = period - 1; i < values.length; i++) {
    const mean = middle[i]
    if (mean === null) continue
    let sumSq = 0
    for (let j = i - period + 1; j <= i; j++) {
      sumSq += (values[j] - mean) ** 2
    }
    const stdev = Math.sqrt(sumSq / period)
    const u = mean + k * stdev
    const l = mean - k * stdev
    upper[i] = u
    lower[i] = l
    bandwidth[i] = mean === 0 ? 0 : (u - l) / mean
  }
  return { upper, middle, lower, bandwidth }
}

// ---------- ATR (Wilder, period=14) ----------

export function atr(candles: OHLCVCandle[], period = 14): Series {
  const out: Series = new Array(candles.length).fill(null)
  if (candles.length <= period) return out

  const trs: number[] = []
  for (let i = 0; i < candles.length; i++) {
    if (i === 0) {
      trs.push(candles[i].high - candles[i].low)
      continue
    }
    const prevClose = candles[i - 1].close
    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - prevClose),
      Math.abs(candles[i].low - prevClose),
    )
    trs.push(tr)
  }

  // Wilder smoothing: first ATR is simple average of first `period` TRs;
  // subsequent values use ATR_t = (ATR_{t-1} * (n-1) + TR_t) / n.
  let prev = 0
  for (let i = 1; i <= period; i++) prev += trs[i]
  prev /= period
  out[period] = prev
  for (let i = period + 1; i < candles.length; i++) {
    prev = (prev * (period - 1) + trs[i]) / period
    out[i] = prev
  }
  return out
}

// ---------- Realized volatility (annualized stdev of log returns, period=30) ----------

// Crypto trades 24/7, so we annualize with 365 rather than the equity 252.
const TRADING_DAYS_PER_YEAR = 365

export function realizedVol(values: number[], period = 30): Series {
  const out: Series = new Array(values.length).fill(null)
  const logReturns: number[] = []
  for (let i = 1; i < values.length; i++) {
    if (values[i - 1] <= 0 || values[i] <= 0) {
      logReturns.push(0)
      continue
    }
    logReturns.push(Math.log(values[i] / values[i - 1]))
  }
  for (let i = period; i < values.length; i++) {
    const slice = logReturns.slice(i - period, i)
    const mean = slice.reduce((a, b) => a + b, 0) / period
    const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period
    out[i] = Math.sqrt(variance) * Math.sqrt(TRADING_DAYS_PER_YEAR)
  }
  return out
}

// ---------- Donchian channel (period=20) ----------

export interface DonchianResult {
  upper: Series
  lower: Series
  middle: Series
}

export function donchian(highs: number[], lows: number[], period = 20): DonchianResult {
  if (highs.length !== lows.length) {
    throw new Error('donchian: highs and lows must be same length')
  }
  const upper: Series = new Array(highs.length).fill(null)
  const lower: Series = new Array(highs.length).fill(null)
  const middle: Series = new Array(highs.length).fill(null)
  for (let i = period - 1; i < highs.length; i++) {
    let hi = -Infinity
    let lo = Infinity
    for (let j = i - period + 1; j <= i; j++) {
      if (highs[j] > hi) hi = highs[j]
      if (lows[j] < lo) lo = lows[j]
    }
    upper[i] = hi
    lower[i] = lo
    middle[i] = (hi + lo) / 2
  }
  return { upper, lower, middle }
}

// ---------- Cross detection ----------

/**
 * Returns the index where `a` crosses above `b` (transitions from a<=b to a>b),
 * or -1 if no cross found within `[from, to)`.
 */
export function crossAbove(a: Series, b: Series, from = 0, to?: number): number {
  const end = to ?? a.length
  for (let i = Math.max(from, 1); i < end; i++) {
    const ap = a[i - 1]
    const bp = b[i - 1]
    const an = a[i]
    const bn = b[i]
    if (ap !== null && bp !== null && an !== null && bn !== null && ap <= bp && an > bn) {
      return i
    }
  }
  return -1
}

export function crossBelow(a: Series, b: Series, from = 0, to?: number): number {
  const end = to ?? a.length
  for (let i = Math.max(from, 1); i < end; i++) {
    const ap = a[i - 1]
    const bp = b[i - 1]
    const an = a[i]
    const bn = b[i]
    if (ap !== null && bp !== null && an !== null && bn !== null && ap >= bp && an < bn) {
      return i
    }
  }
  return -1
}
