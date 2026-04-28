/**
 * Statistical analytics module (Sprint 10, STORY-1002..1005).
 *
 * Pure-function risk-adjusted return metrics, distribution moments,
 * correlation matrices, rolling z-scores, and Hurst exponent. Operates on
 * the same OHLCV data the indicator service consumes — no external feeds.
 *
 * Annualization: crypto trades 24/7 so we use 365 trading days per year,
 * not the 252 conventional for equities. Log returns are used everywhere
 * (returns add cleanly across time, and matters for daily compounding).
 *
 * Reference values verified against scipy.stats / numpy / pandas — see
 * statistics.test.ts.
 */

const TRADING_DAYS_PER_YEAR = 365

// ---------- Log returns ----------

/**
 * Convert a closing-price series into a daily log-return series. Drops
 * non-positive prices defensively (returns 0 for that step rather than NaN).
 */
export function logReturns(closes: number[]): number[] {
  const out: number[] = []
  for (let i = 1; i < closes.length; i++) {
    const a = closes[i - 1]
    const b = closes[i]
    if (a <= 0 || b <= 0) {
      out.push(0)
      continue
    }
    out.push(Math.log(b / a))
  }
  return out
}

// ---------- Sharpe / Sortino / drawdown ----------

export interface RiskAdjustedMetrics {
  /** Annualized Sharpe ratio. NaN if return series has zero variance. */
  sharpe: number
  /** Annualized Sortino ratio (downside deviation only). NaN if no downside. */
  sortino: number
  /** Max drawdown as a positive fraction (0.25 == 25% peak-to-trough). */
  maxDrawdown: number
  /** Length in candles of the longest drawdown period. */
  maxDrawdownDuration: number
}

export interface RiskAdjustedOptions {
  /** Annualized risk-free rate (e.g. 0.04 = 4%). Default 4% for USD treasuries. */
  riskFreeRate?: number
}

export function riskAdjustedMetrics(
  closes: number[],
  opts: RiskAdjustedOptions = {},
): RiskAdjustedMetrics {
  const { riskFreeRate = 0.04 } = opts
  const returns = logReturns(closes)
  if (returns.length === 0) {
    return { sharpe: NaN, sortino: NaN, maxDrawdown: 0, maxDrawdownDuration: 0 }
  }
  const mean = average(returns)
  const std = stdev(returns, mean)
  const dailyRf = riskFreeRate / TRADING_DAYS_PER_YEAR
  const excess = mean - dailyRf
  const sharpe =
    std === 0 ? NaN : (excess / std) * Math.sqrt(TRADING_DAYS_PER_YEAR)

  // Sortino — denominator is downside deviation of returns below the target.
  const downside = returns.filter((r) => r < dailyRf)
  let downsideDev = 0
  if (downside.length > 0) {
    let sumSq = 0
    for (const r of downside) sumSq += (r - dailyRf) ** 2
    downsideDev = Math.sqrt(sumSq / returns.length)
  }
  const sortino =
    downsideDev === 0
      ? NaN
      : (excess / downsideDev) * Math.sqrt(TRADING_DAYS_PER_YEAR)

  // Max drawdown over the equity curve (compounded log returns).
  let peak = closes[0]
  let peakIdx = 0
  let maxDD = 0
  let maxDDDuration = 0
  let curDuration = 0
  for (let i = 1; i < closes.length; i++) {
    if (closes[i] > peak) {
      peak = closes[i]
      peakIdx = i
      curDuration = 0
    } else {
      curDuration = i - peakIdx
      const dd = peak === 0 ? 0 : (peak - closes[i]) / peak
      if (dd > maxDD) maxDD = dd
      if (curDuration > maxDDDuration) maxDDDuration = curDuration
    }
  }

  return { sharpe, sortino, maxDrawdown: maxDD, maxDrawdownDuration: maxDDDuration }
}

// ---------- Distribution moments ----------

export interface DistributionMoments {
  mean: number
  stdev: number
  /** Fisher's skewness — 0 = symmetric, < 0 = left-skewed (more big losses). */
  skewness: number
  /** Excess kurtosis (Fisher) — 0 = normal, > 0 = fat tails (leptokurtic). */
  excessKurtosis: number
  /** Number of observations. */
  count: number
}

export function distributionMoments(closes: number[]): DistributionMoments {
  const returns = logReturns(closes)
  const n = returns.length
  if (n === 0) {
    return { mean: 0, stdev: 0, skewness: 0, excessKurtosis: 0, count: 0 }
  }
  const m = average(returns)
  const sd = stdev(returns, m)
  if (sd === 0) {
    return { mean: m, stdev: 0, skewness: 0, excessKurtosis: 0, count: n }
  }
  let s3 = 0
  let s4 = 0
  for (const r of returns) {
    const d = (r - m) / sd
    s3 += d ** 3
    s4 += d ** 4
  }
  // Sample skewness (bias-uncorrected — matches scipy.stats.skew default).
  const skew = s3 / n
  const exKurt = s4 / n - 3
  return { mean: m, stdev: sd, skewness: skew, excessKurtosis: exKurt, count: n }
}

// ---------- Correlation matrix ----------

/**
 * Pearson correlation matrix across multiple price series. Series are
 * truncated to the shortest length so misaligned candle counts don't
 * silently bias the correlation.
 */
export function correlationMatrix(
  series: Record<string, number[]>,
): { symbols: string[]; matrix: number[][] } {
  const symbols = Object.keys(series)
  if (symbols.length === 0) return { symbols, matrix: [] }
  const minLen = Math.min(...symbols.map((s) => series[s].length))
  const truncated = symbols.map((s) => series[s].slice(-minLen))
  const returns = truncated.map((closes) => logReturns(closes))
  const matrix: number[][] = []
  for (let i = 0; i < symbols.length; i++) {
    matrix.push([])
    for (let j = 0; j < symbols.length; j++) {
      matrix[i].push(pearson(returns[i], returns[j]))
    }
  }
  return { symbols, matrix }
}

function pearson(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length)
  if (n < 2) return 0
  let sumA = 0
  let sumB = 0
  for (let i = 0; i < n; i++) {
    sumA += a[i]
    sumB += b[i]
  }
  const meanA = sumA / n
  const meanB = sumB / n
  let num = 0
  let denomA = 0
  let denomB = 0
  for (let i = 0; i < n; i++) {
    const da = a[i] - meanA
    const db = b[i] - meanB
    num += da * db
    denomA += da * da
    denomB += db * db
  }
  const denom = Math.sqrt(denomA * denomB)
  return denom === 0 ? 0 : num / denom
}

// ---------- Rolling z-score ----------

/**
 * Rolling z-score: (value - rolling-mean) / rolling-stdev. Useful for
 * mean-reversion signals — |z| > 2 marks statistically extreme excursions.
 */
export function rollingZScore(values: number[], window = 30): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null)
  if (window <= 1 || values.length < window) return out
  for (let i = window - 1; i < values.length; i++) {
    const slice = values.slice(i - window + 1, i + 1)
    const m = average(slice)
    const sd = stdev(slice, m)
    out[i] = sd === 0 ? 0 : (values[i] - m) / sd
  }
  return out
}

// ---------- Hurst exponent ----------

/**
 * Hurst exponent via rescaled-range (R/S) analysis.
 *
 *   H ≈ 0.5  → random walk (efficient market)
 *   H > 0.5  → trending / persistent
 *   H < 0.5  → mean-reverting / anti-persistent
 *
 * Honest scope note: R/S is sample-size sensitive — at least 200
 * observations recommended. The implementation logs a warning via the
 * returned `warning` field when the series is too short to be reliable.
 */
export interface HurstResult {
  exponent: number
  warning?: string
}

export function hurstExponent(closes: number[]): HurstResult {
  const returns = logReturns(closes)
  const n = returns.length
  if (n < 20) {
    return {
      exponent: 0.5,
      warning: 'series too short for R/S analysis (need ≥ 20 returns)',
    }
  }
  const lags = [10, 20, 40, 80, 160].filter((l) => l < n)
  if (lags.length < 2) {
    return {
      exponent: 0.5,
      warning: 'series too short to fit a meaningful R/S regression',
    }
  }
  const xs: number[] = []
  const ys: number[] = []
  for (const lag of lags) {
    const rs = rescaledRange(returns, lag)
    if (rs > 0) {
      xs.push(Math.log(lag))
      ys.push(Math.log(rs))
    }
  }
  if (xs.length < 2) {
    return { exponent: 0.5, warning: 'R/S undefined for the supplied series' }
  }
  const slope = leastSquaresSlope(xs, ys)
  const result: HurstResult = { exponent: slope }
  if (n < 200) {
    result.warning = 'R/S estimate may be noisy: < 200 observations'
  }
  return result
}

function rescaledRange(returns: number[], lag: number): number {
  const chunks = Math.floor(returns.length / lag)
  if (chunks === 0) return 0
  let sumRS = 0
  let count = 0
  for (let c = 0; c < chunks; c++) {
    const slice = returns.slice(c * lag, (c + 1) * lag)
    const m = average(slice)
    let cum = 0
    let mn = Infinity
    let mx = -Infinity
    for (const r of slice) {
      cum += r - m
      if (cum < mn) mn = cum
      if (cum > mx) mx = cum
    }
    const range = mx - mn
    const sd = stdev(slice, m)
    if (sd > 0) {
      sumRS += range / sd
      count++
    }
  }
  return count === 0 ? 0 : sumRS / count
}

function leastSquaresSlope(xs: number[], ys: number[]): number {
  const n = xs.length
  const meanX = average(xs)
  const meanY = average(ys)
  let num = 0
  let den = 0
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (ys[i] - meanY)
    den += (xs[i] - meanX) ** 2
  }
  return den === 0 ? 0.5 : num / den
}

// ---------- Internal numeric helpers ----------

function average(values: number[]): number {
  if (values.length === 0) return 0
  let sum = 0
  for (const v of values) sum += v
  return sum / values.length
}

function stdev(values: number[], mean: number): number {
  if (values.length === 0) return 0
  let sumSq = 0
  for (const v of values) sumSq += (v - mean) ** 2
  return Math.sqrt(sumSq / values.length)
}
