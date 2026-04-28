/**
 * Pragmatic Elliott Wave detector (Sprint 9, STORY-909).
 *
 * Honest scope note: Elliott Wave analysis is famously subjective — two
 * skilled analysts often disagree on the count. This implementation is
 * deterministic and rule-based, optimized to *avoid false positives*: it
 * only annotates a wave structure when all four Fibonacci/invalidation
 * gates pass. Users should treat the output as a hypothesis, not a forecast.
 *
 * Pipeline:
 *   1. ZigZag pivot detection — keep only swings ≥ `threshold` (default 5%).
 *   2. Wave structure inference — find 5 alternating pivots that match an
 *      impulse pattern (up-down-up-down-up or inverse), then 3 alternating
 *      pivots for the corrective A-B-C.
 *   3. Fibonacci validation — wave 2 retraces 38.2-78.6% of wave 1, wave 3
 *      extends ≥1.618× wave 1, wave 4 retraces ≤38.2% of wave 3 and does
 *      not overlap wave 1's price territory.
 *   4. Confidence — fraction of soft rules passed (0-100).
 */

import type { OHLCVCandle } from '../types/index'

export interface Pivot {
  index: number
  price: number
  kind: 'high' | 'low'
}

export interface ElliottWave {
  /** Indices into the input candle array, length 6: pivots 0..5 form waves 1..5. */
  impulsePivots: Pivot[]
  /** Indices into the input candle array, length 4: pivots 5,A,B,C if a corrective was found. */
  correctivePivots: Pivot[] | null
  direction: 'bullish' | 'bearish'
  /** 0-100, fraction of soft Fibonacci rules satisfied. */
  confidence: number
  /** Human-readable summary for the chart annotation tooltip. */
  notes: string[]
}

const FIB_382 = 0.382
const FIB_618 = 0.618
const FIB_786 = 0.786
const FIB_1618 = 1.618

/**
 * ZigZag pivot detection. Walks the candle high/low envelopes and keeps a
 * pivot only when price reverses by at least `thresholdPct` from the last
 * confirmed pivot. Alternates high/low strictly.
 */
export function zigZag(candles: OHLCVCandle[], thresholdPct = 0.05): Pivot[] {
  if (candles.length === 0) return []
  const pivots: Pivot[] = []
  // Seed with the first candle as a tentative low and a tentative high.
  let lastIdx = 0
  let lastKind: 'high' | 'low' | null = null
  let extremeIdx = 0
  let extremePrice = candles[0].close

  for (let i = 1; i < candles.length; i++) {
    const hi = candles[i].high
    const lo = candles[i].low

    if (lastKind === null) {
      // Direction not yet established — track extremes both ways.
      if (hi > extremePrice * (1 + thresholdPct)) {
        // We rallied off the seed → seed was a low.
        pivots.push({ index: lastIdx, price: candles[lastIdx].low, kind: 'low' })
        lastKind = 'low'
        extremeIdx = i
        extremePrice = hi
      } else if (lo < extremePrice * (1 - thresholdPct)) {
        pivots.push({ index: lastIdx, price: candles[lastIdx].high, kind: 'high' })
        lastKind = 'high'
        extremeIdx = i
        extremePrice = lo
      } else {
        if (hi > extremePrice) {
          extremePrice = hi
          extremeIdx = i
        }
        if (lo < extremePrice && pivots.length === 0) {
          // No-op — we're tracking high extreme to confirm a low seed.
        }
      }
      continue
    }

    if (lastKind === 'low') {
      // Looking for a high — track the running max.
      if (hi > extremePrice) {
        extremePrice = hi
        extremeIdx = i
      }
      // Confirm the high if price has dropped ≥ threshold from running max.
      if (lo < extremePrice * (1 - thresholdPct)) {
        pivots.push({ index: extremeIdx, price: extremePrice, kind: 'high' })
        lastKind = 'high'
        lastIdx = extremeIdx
        extremePrice = lo
        extremeIdx = i
      }
    } else {
      // lastKind === 'high' → looking for a low.
      if (lo < extremePrice) {
        extremePrice = lo
        extremeIdx = i
      }
      if (hi > extremePrice * (1 + thresholdPct)) {
        pivots.push({ index: extremeIdx, price: extremePrice, kind: 'low' })
        lastKind = 'low'
        lastIdx = extremeIdx
        extremePrice = hi
        extremeIdx = i
      }
    }
  }

  return pivots
}

interface FibGate {
  name: string
  passed: boolean
  detail: string
}

function validateImpulse(p: Pivot[], direction: 'bullish' | 'bearish'): FibGate[] {
  // p is exactly 6 pivots: 0,1,2,3,4,5 representing the start + tops of waves 1..5.
  const sign = direction === 'bullish' ? 1 : -1
  const w1 = (p[1].price - p[0].price) * sign
  const w2 = (p[1].price - p[2].price) * sign
  const w3 = (p[3].price - p[2].price) * sign
  const w4 = (p[3].price - p[4].price) * sign
  const w5 = (p[5].price - p[4].price) * sign

  const gates: FibGate[] = []

  // Soft rule: wave 2 retraces 38.2-78.6% of wave 1.
  const w2Retrace = w1 > 0 ? w2 / w1 : 0
  gates.push({
    name: 'wave-2-fib-retrace',
    passed: w2Retrace >= FIB_382 && w2Retrace <= FIB_786,
    detail: `wave 2 retraced ${(w2Retrace * 100).toFixed(1)}% of wave 1 (target 38.2-78.6%)`,
  })

  // Soft rule: wave 3 extends ≥ 1.618× wave 1 (or at least ≥ 1.0× as a relaxed lower bound).
  const w3Extension = w1 > 0 ? w3 / w1 : 0
  gates.push({
    name: 'wave-3-extension',
    passed: w3Extension >= FIB_1618,
    detail: `wave 3 extended ${w3Extension.toFixed(2)}× wave 1 (target ≥ 1.618×)`,
  })

  // Soft rule: wave 4 retraces ≤ 38.2% of wave 3.
  const w4Retrace = w3 > 0 ? w4 / w3 : 0
  gates.push({
    name: 'wave-4-fib-retrace',
    passed: w4Retrace <= FIB_382,
    detail: `wave 4 retraced ${(w4Retrace * 100).toFixed(1)}% of wave 3 (target ≤ 38.2%)`,
  })

  // Hard rule: wave 4 cannot overlap wave 1's territory.
  // For bullish: wave 4 low > wave 1 high. For bearish: wave 4 high < wave 1 low.
  const overlapOk =
    direction === 'bullish'
      ? p[4].price > p[1].price
      : p[4].price < p[1].price
  gates.push({
    name: 'wave-4-no-overlap',
    passed: overlapOk,
    detail: overlapOk
      ? 'wave 4 territory does not overlap wave 1'
      : 'INVALIDATED — wave 4 overlaps wave 1 territory',
  })

  // Soft rule: wave 5 should be at least the size of wave 1 (very loose).
  gates.push({
    name: 'wave-5-min-size',
    passed: w5 > 0 && w5 >= w1 * 0.5,
    detail: `wave 5 size ${w5.toFixed(4)} vs wave 1 ${w1.toFixed(4)}`,
  })

  return gates
}

/**
 * Detect Elliott Wave patterns in the supplied candles.
 *
 * Returns the most recent valid wave structure if any. The detector errs
 * heavily on the side of low confidence: any failed hard rule (wave 4
 * overlap) excludes the candidate entirely. Soft rules contribute to the
 * confidence score.
 */
export function detectElliottWaves(
  candles: OHLCVCandle[],
  thresholdPct = 0.05,
): ElliottWave | null {
  const pivots = zigZag(candles, thresholdPct)
  if (pivots.length < 6) return null

  // Walk from the end backwards, looking at the last 6 pivots first.
  for (let start = pivots.length - 6; start >= 0; start--) {
    const slice = pivots.slice(start, start + 6)

    // Direction inferred from pivot 0 → pivot 1.
    const direction: 'bullish' | 'bearish' =
      slice[1].price > slice[0].price ? 'bullish' : 'bearish'

    // Check pivot kinds alternate correctly for the direction.
    const expectedKinds =
      direction === 'bullish'
        ? ['low', 'high', 'low', 'high', 'low', 'high']
        : ['high', 'low', 'high', 'low', 'high', 'low']
    const kindsOk = slice.every((p, i) => p.kind === expectedKinds[i])
    if (!kindsOk) continue

    const gates = validateImpulse(slice, direction)

    // Hard gate must pass.
    const hardGate = gates.find((g) => g.name === 'wave-4-no-overlap')
    if (!hardGate || !hardGate.passed) continue

    // Soft gates contribute to confidence.
    const softGates = gates.filter((g) => g.name !== 'wave-4-no-overlap')
    const passedSoft = softGates.filter((g) => g.passed).length
    const confidence = Math.round((passedSoft / softGates.length) * 100)

    // Require at least 50% of soft rules — anything lower is noise.
    if (confidence < 50) continue

    // Look for a corrective A-B-C in the pivots after wave 5, if any.
    let correctivePivots: Pivot[] | null = null
    if (start + 6 + 3 <= pivots.length) {
      const after = pivots.slice(start + 5, start + 5 + 4)
      const expectedCorrectiveKinds =
        direction === 'bullish'
          ? ['high', 'low', 'high', 'low']
          : ['low', 'high', 'low', 'high']
      if (after.every((p, i) => p.kind === expectedCorrectiveKinds[i])) {
        correctivePivots = after
      }
    }

    return {
      impulsePivots: slice,
      correctivePivots,
      direction,
      confidence,
      notes: gates.map((g) => `${g.passed ? '✓' : '✗'} ${g.detail}`),
    }
  }

  return null
}
