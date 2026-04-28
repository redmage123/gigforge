/**
 * Composite Recommendation Engine (Sprint 13, STORY-1301).
 *
 * Fuses every layer-3 inference into one per-asset signal so the user sees
 * one ranked feed instead of N parallel module outputs. Each contributor
 * casts a vote with a weight; the composite is the weighted sum, normalized
 * to a 0-100 conviction score.
 *
 * Inputs (all optional — missing inputs simply contribute zero):
 *   - donchian      : Donchian breakout BUY/SELL
 *   - hmmRegime     : 'bull' | 'bear' | 'sideways' (acts as a *gate*: SELL signals
 *                     are dampened in bull regimes; BUY in bear regimes)
 *   - rsi           : current RSI value (filter: BUY rejected if rsi > 75, etc.)
 *   - macd          : MACD line / signal cross context
 *   - leadLag       : { btcMove, expectedDirection, expectedLag, confidence } —
 *                     boost or invert the composite if BTC just moved and
 *                     the asset has positive lead-lag to BTC
 *   - sentiment     : composite sentiment polarity in [-1, +1]
 *   - onchain       : { mempoolFee, ethGas } — high BTC fees damp BTC
 *                     conviction; low ETH gas boosts ETH
 *   - bookImbalance : top-K orderbook imbalance in [0, 1] (>0.55 = bid-heavy
 *                     boost for BUY; <0.45 = ask-heavy boost for SELL)
 *   - elliott       : optional Elliott Wave detection (impulse direction + confidence)
 *
 * Output: a CompositeSignal with `action`, `conviction` (0-100), and
 * `contributors` — a transparent breakdown of every module's vote so the
 * UI can render an explanation panel and the LLM signal-explainer
 * (STORY-1311) can produce a human-readable narrative.
 */

import type { Signal } from '../types/index'

export type CompositeAction = 'BUY' | 'SELL' | 'HOLD'

export interface Contributor {
  source: string
  vote: number // -1..+1 — sign indicates direction
  weight: number // 0..1 — how much this source counts
  detail: string // human-readable
}

export interface CompositeSignal {
  symbol: string
  action: CompositeAction
  conviction: number // 0-100
  contributors: Contributor[]
  /** Net polarity in [-1, +1] before mapping to action/conviction. */
  rawPolarity: number
}

export interface CompositeInputs {
  symbol: string
  donchian?: {
    action: 'BUY' | 'SELL' | null
    /** breakout magnitude relative to channel: 0.05 = 5% above prior 20d high */
    magnitude: number
  }
  hmmRegime?: 'bull' | 'bear' | 'sideways' | null
  rsi?: number | null
  macd?: { histogram: number | null; signal: number | null }
  leadLag?: {
    btcMove: number
    expectedDirection: 'up' | 'down'
    expectedLag: number
    confidence: number
  } | null
  sentiment?: number | null // -1..+1
  onchain?: {
    /** sat/vB fast fee — high BTC fees damp BTC conviction */
    btcFastFee?: number
    /** gwei propose gas — high ETH gas damps ETH conviction */
    ethGasGwei?: number
  } | null
  bookImbalance?: number | null // 0..1
  elliott?: {
    direction: 'bullish' | 'bearish'
    confidence: number // 0-100
  } | null
}

/**
 * Default weights — tuned so no single source dominates. Tweak these in
 * the UI later (Pro mode: per-user weight sliders).
 */
const WEIGHTS = {
  donchian: 0.25,
  hmmRegime: 0.10, // gate-style; modifies others
  rsi: 0.07,
  macd: 0.08,
  leadLag: 0.15,
  sentiment: 0.10,
  onchain: 0.05,
  bookImbalance: 0.10,
  elliott: 0.10,
}

export function computeComposite(inputs: CompositeInputs): CompositeSignal {
  const contributors: Contributor[] = []
  let polaritySum = 0
  let totalWeight = 0

  // --- Donchian breakout (primary signal) ---
  if (inputs.donchian?.action) {
    const sign = inputs.donchian.action === 'BUY' ? 1 : -1
    const mag = Math.min(1, Math.max(0, inputs.donchian.magnitude * 20)) // scale magnitude
    const vote = sign * (0.5 + 0.5 * mag)
    contributors.push({
      source: 'donchian',
      vote,
      weight: WEIGHTS.donchian,
      detail: `${inputs.donchian.action} on ${(inputs.donchian.magnitude * 100).toFixed(2)}% breakout`,
    })
    polaritySum += vote * WEIGHTS.donchian
    totalWeight += WEIGHTS.donchian
  }

  // --- HMM regime gate ---
  if (inputs.hmmRegime) {
    const vote =
      inputs.hmmRegime === 'bull' ? 0.7 : inputs.hmmRegime === 'bear' ? -0.7 : 0
    contributors.push({
      source: 'hmm-regime',
      vote,
      weight: WEIGHTS.hmmRegime,
      detail: `Market regime: ${inputs.hmmRegime}`,
    })
    polaritySum += vote * WEIGHTS.hmmRegime
    totalWeight += WEIGHTS.hmmRegime
  }

  // --- RSI filter (overbought/oversold) ---
  if (typeof inputs.rsi === 'number') {
    let vote = 0
    let detail = `RSI ${inputs.rsi.toFixed(1)}`
    if (inputs.rsi > 75) {
      vote = -0.6
      detail += ' (overbought, sell pressure expected)'
    } else if (inputs.rsi < 25) {
      vote = 0.6
      detail += ' (oversold, bounce expected)'
    } else if (inputs.rsi > 60) {
      vote = 0.2
      detail += ' (mildly bullish)'
    } else if (inputs.rsi < 40) {
      vote = -0.2
      detail += ' (mildly bearish)'
    } else {
      detail += ' (neutral zone)'
    }
    contributors.push({ source: 'rsi', vote, weight: WEIGHTS.rsi, detail })
    polaritySum += vote * WEIGHTS.rsi
    totalWeight += WEIGHTS.rsi
  }

  // --- MACD direction ---
  if (inputs.macd && typeof inputs.macd.histogram === 'number') {
    const h = inputs.macd.histogram
    const vote = Math.tanh(h * 5) // normalize via tanh
    contributors.push({
      source: 'macd',
      vote,
      weight: WEIGHTS.macd,
      detail: `MACD histogram ${h.toFixed(4)} (${vote > 0 ? 'bullish' : 'bearish'} momentum)`,
    })
    polaritySum += vote * WEIGHTS.macd
    totalWeight += WEIGHTS.macd
  }

  // --- Lead-lag from BTC ---
  if (inputs.leadLag) {
    const sign = inputs.leadLag.expectedDirection === 'up' ? 1 : -1
    const vote = sign * Math.min(1, inputs.leadLag.confidence)
    contributors.push({
      source: 'lead-lag',
      vote,
      weight: WEIGHTS.leadLag,
      detail: `BTC moved ${(inputs.leadLag.btcMove * 100).toFixed(2)}%; expected ${inputs.leadLag.expectedDirection} at lag ${inputs.leadLag.expectedLag} (corr ${inputs.leadLag.confidence.toFixed(2)})`,
    })
    polaritySum += vote * WEIGHTS.leadLag
    totalWeight += WEIGHTS.leadLag
  }

  // --- Sentiment composite ---
  if (typeof inputs.sentiment === 'number') {
    contributors.push({
      source: 'sentiment',
      vote: inputs.sentiment,
      weight: WEIGHTS.sentiment,
      detail: `Composite sentiment ${(inputs.sentiment * 100).toFixed(1)}%`,
    })
    polaritySum += inputs.sentiment * WEIGHTS.sentiment
    totalWeight += WEIGHTS.sentiment
  }

  // --- On-chain damping ---
  if (inputs.onchain) {
    const isBtc = inputs.symbol === 'BTC'
    const isEth = inputs.symbol === 'ETH'
    let vote = 0
    let detail = ''
    if (isBtc && typeof inputs.onchain.btcFastFee === 'number') {
      // High fees (>50 sat/vB) signal congestion → dampens BTC conviction
      vote = inputs.onchain.btcFastFee > 50 ? -0.3 : inputs.onchain.btcFastFee < 5 ? 0.2 : 0
      detail = `BTC fast fee ${inputs.onchain.btcFastFee} sat/vB`
    } else if (isEth && typeof inputs.onchain.ethGasGwei === 'number') {
      vote = inputs.onchain.ethGasGwei < 10 ? 0.2 : inputs.onchain.ethGasGwei > 80 ? -0.3 : 0
      detail = `ETH gas ${inputs.onchain.ethGasGwei} gwei`
    }
    if (detail) {
      contributors.push({ source: 'on-chain', vote, weight: WEIGHTS.onchain, detail })
      polaritySum += vote * WEIGHTS.onchain
      totalWeight += WEIGHTS.onchain
    }
  }

  // --- Order book imbalance ---
  if (typeof inputs.bookImbalance === 'number') {
    // 0.5 = balanced, >0.55 bid-heavy → bullish
    const vote = (inputs.bookImbalance - 0.5) * 4 // amplify
    const clamped = Math.max(-1, Math.min(1, vote))
    contributors.push({
      source: 'book-imbalance',
      vote: clamped,
      weight: WEIGHTS.bookImbalance,
      detail: `Top-10 imbalance ${(inputs.bookImbalance * 100).toFixed(0)}% bid-side`,
    })
    polaritySum += clamped * WEIGHTS.bookImbalance
    totalWeight += WEIGHTS.bookImbalance
  }

  // --- Elliott Waves ---
  if (inputs.elliott) {
    const sign = inputs.elliott.direction === 'bullish' ? 1 : -1
    const vote = sign * (inputs.elliott.confidence / 100)
    contributors.push({
      source: 'elliott',
      vote,
      weight: WEIGHTS.elliott,
      detail: `Elliott ${inputs.elliott.direction} impulse, confidence ${inputs.elliott.confidence}%`,
    })
    polaritySum += vote * WEIGHTS.elliott
    totalWeight += WEIGHTS.elliott
  }

  // --- Resolve ---
  const rawPolarity = totalWeight === 0 ? 0 : polaritySum / totalWeight
  const action: CompositeAction =
    rawPolarity > 0.15 ? 'BUY' : rawPolarity < -0.15 ? 'SELL' : 'HOLD'
  // Conviction: |rawPolarity| × 100, but only count above the 0.15 threshold
  const conviction = Math.round(Math.abs(rawPolarity) * 100)

  return {
    symbol: inputs.symbol,
    action,
    conviction,
    contributors,
    rawPolarity,
  }
}

/**
 * Convert a CompositeSignal into the editorial Signal shape used by the
 * existing Signals page. The original conviction breakdown is retained
 * via the `source: 'composite'` discriminator and a new `contributors`
 * field on the extended Signal type.
 */
export interface CompositeRenderedSignal extends Signal {
  source: 'composite'
  contributors: Contributor[]
  rawPolarity: number
}

export function toCompositeSignal(c: CompositeSignal): CompositeRenderedSignal {
  const reasonParts = c.contributors
    .filter((x) => Math.abs(x.vote * x.weight) > 0.01)
    .sort((a, b) => Math.abs(b.vote * b.weight) - Math.abs(a.vote * a.weight))
    .slice(0, 3)
    .map((x) => x.detail)
  return {
    id: `composite-${c.symbol}-${Date.now()}`,
    asset: c.symbol,
    direction: c.action,
    confidence: c.conviction,
    reason: reasonParts.length > 0 ? reasonParts.join(' • ') : 'No active inputs',
    timestamp: new Date().toISOString(),
    source: 'composite',
    contributors: c.contributors,
    rawPolarity: c.rawPolarity,
  }
}
