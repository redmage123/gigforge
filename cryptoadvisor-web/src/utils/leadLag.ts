/**
 * Cross-asset lead-lag analyzer (Sprint 11, STORY-1104).
 *
 * Crypto's strongest single statistical regularity: BTC moves first,
 * altcoins follow at a measurable lag. This module quantifies that lag
 * for each watchlist altcoin against BTC by computing lagged Pearson
 * correlation between the leader's returns at time t-k and the
 * follower's returns at time t for k = 1..maxLag.
 *
 * The reported `optimalLag` is the lag with the highest correlation
 * magnitude. A signal fires when:
 *   - BTC's most-recent return is large (|r_BTC| > threshold)
 *   - The optimal lag for that altcoin is positive (BTC leads)
 *   - Confidence (correlation strength) is above a floor
 *
 * Honest scope note: lead-lag correlations decay quickly during
 * regime changes. The signals carry confidence scores so the UI can
 * de-emphasize low-confidence emissions.
 */

export interface LeadLagAnalysis {
  leader: string
  follower: string
  /** correlation at lag k (k = 0..maxLag). lags[k] = Pearson(leader[t-k], follower[t]). */
  lags: number[]
  /** Lag with highest |correlation| in [1, maxLag]. */
  optimalLag: number
  /** Correlation at the optimal lag. */
  optimalCorrelation: number
}

export function analyzeLeadLag(
  leaderReturns: number[],
  followerReturns: number[],
  maxLag = 5,
): LeadLagAnalysis {
  const n = Math.min(leaderReturns.length, followerReturns.length)
  const a = leaderReturns.slice(-n)
  const b = followerReturns.slice(-n)
  const lags: number[] = []
  for (let k = 0; k <= maxLag; k++) {
    if (k >= n) {
      lags.push(0)
      continue
    }
    const x = a.slice(0, n - k)
    const y = b.slice(k)
    lags.push(pearson(x, y))
  }
  let optLag = 0
  let optCorr = lags[0]
  for (let k = 1; k <= maxLag; k++) {
    if (Math.abs(lags[k]) > Math.abs(optCorr)) {
      optCorr = lags[k]
      optLag = k
    }
  }
  return {
    leader: 'leader',
    follower: 'follower',
    lags,
    optimalLag: optLag,
    optimalCorrelation: optCorr,
  }
}

export interface LeadLagSignal {
  follower: string
  leaderMove: number
  expectedDirection: 'up' | 'down'
  /** Optimal lag in candles — how soon to expect the follower move. */
  expectedLag: number
  /** |correlation at optimal lag| — 0..1. */
  confidence: number
}

export interface LeadLagSignalOptions {
  minMagnitude?: number
  minConfidence?: number
}

export function generateLeadLagSignals(
  leaderRecentReturn: number,
  analyses: Array<LeadLagAnalysis & { followerSymbol: string }>,
  opts: LeadLagSignalOptions = {},
): LeadLagSignal[] {
  const { minMagnitude = 0.02, minConfidence = 0.3 } = opts
  if (Math.abs(leaderRecentReturn) < minMagnitude) return []
  const out: LeadLagSignal[] = []
  for (const a of analyses) {
    if (a.optimalLag <= 0) continue
    const conf = Math.abs(a.optimalCorrelation)
    if (conf < minConfidence) continue
    const same = a.optimalCorrelation > 0
    const expectedDirection: 'up' | 'down' =
      same === leaderRecentReturn > 0 ? 'up' : 'down'
    out.push({
      follower: a.followerSymbol,
      leaderMove: leaderRecentReturn,
      expectedDirection,
      expectedLag: a.optimalLag,
      confidence: conf,
    })
  }
  return out
}

// ---------- Helpers ----------

function pearson(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length)
  if (n < 2) return 0
  let sa = 0
  let sb = 0
  for (let i = 0; i < n; i++) {
    sa += a[i]
    sb += b[i]
  }
  const ma = sa / n
  const mb = sb / n
  let num = 0
  let denA = 0
  let denB = 0
  for (let i = 0; i < n; i++) {
    const da = a[i] - ma
    const db = b[i] - mb
    num += da * db
    denA += da * da
    denB += db * db
  }
  const den = Math.sqrt(denA * denB)
  return den === 0 ? 0 : num / den
}
