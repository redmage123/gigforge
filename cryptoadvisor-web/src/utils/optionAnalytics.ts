/**
 * Option-chain analytics derived from Deribit feed (Sprint 11).
 *
 * Implements:
 *   - IV rank / IV percentile across the term structure
 *   - Put/call skew (25-delta risk reversal proxy)
 *   - Volatility smile data shaping for Recharts
 */

import type { OptionChain, OptionChainRow } from '../api/deribit'

export interface SmilePoint {
  strike: number
  callIv: number | null
  putIv: number | null
  /** Average of call+put IV when both exist, else whichever is non-null. */
  iv: number | null
}

export function buildVolatilitySmile(chain: OptionChain): SmilePoint[] {
  return chain.rows.map((row): SmilePoint => {
    const callIv = row.call?.mark_iv ?? null
    const putIv = row.put?.mark_iv ?? null
    let iv: number | null = null
    if (callIv !== null && putIv !== null) iv = (callIv + putIv) / 2
    else if (callIv !== null) iv = callIv
    else if (putIv !== null) iv = putIv
    return { strike: row.strike, callIv, putIv, iv }
  })
}

/**
 * 25-delta risk reversal proxy: average IV of OTM puts (strike < spot) minus
 * average IV of OTM calls (strike > spot) using strikes nearest the 25-delta
 * point. Positive skew = OTM puts more expensive than OTM calls (downside
 * fear); negative = OTM calls more expensive (upside greed).
 *
 * We approximate "25 delta" as a strike ~10% below/above spot rather than
 * solving for the actual delta target. This is a reasonable proxy for crypto
 * where the smile is broad and delta interpolation requires more chain depth
 * than Deribit always provides at distant expiries.
 */
export function putCallSkew(chain: OptionChain): number {
  const spot = chain.underlyingPrice
  if (spot === 0) return 0
  const downStrike = spot * 0.9
  const upStrike = spot * 1.1
  const putIvs = chain.rows
    .filter((r) => r.strike < spot && Math.abs(r.strike - downStrike) < spot * 0.05)
    .map((r) => r.put?.mark_iv)
    .filter((iv): iv is number => typeof iv === 'number' && iv > 0)
  const callIvs = chain.rows
    .filter((r) => r.strike > spot && Math.abs(r.strike - upStrike) < spot * 0.05)
    .map((r) => r.call?.mark_iv)
    .filter((iv): iv is number => typeof iv === 'number' && iv > 0)
  if (putIvs.length === 0 || callIvs.length === 0) return 0
  const avgPut = putIvs.reduce((s, v) => s + v, 0) / putIvs.length
  const avgCall = callIvs.reduce((s, v) => s + v, 0) / callIvs.length
  return avgPut - avgCall
}

/**
 * IV rank across an array of recent ATM IVs (typically the front-month IV
 * over the last N days). 0 = current IV is the lowest in the window;
 * 100 = highest.
 */
export function ivRank(currentIv: number, history: number[]): number {
  if (history.length === 0) return 50
  const min = Math.min(...history)
  const max = Math.max(...history)
  if (max === min) return 50
  return Math.min(100, Math.max(0, ((currentIv - min) / (max - min)) * 100))
}

/**
 * IV percentile: fraction of history values strictly below currentIv.
 */
export function ivPercentile(currentIv: number, history: number[]): number {
  if (history.length === 0) return 50
  const below = history.filter((v) => v < currentIv).length
  return (below / history.length) * 100
}

/** Pick the chain row whose strike is nearest to the spot (ATM proxy). */
export function atmRow(chain: OptionChain): OptionChainRow | null {
  if (chain.rows.length === 0) return null
  const spot = chain.underlyingPrice
  let best = chain.rows[0]
  let bestDist = Math.abs(best.strike - spot)
  for (const r of chain.rows) {
    const d = Math.abs(r.strike - spot)
    if (d < bestDist) {
      bestDist = d
      best = r
    }
  }
  return best
}
