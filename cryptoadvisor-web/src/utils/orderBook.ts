/**
 * L2 order book primitives + analytics (Sprint 12, STORY-1110).
 *
 * Maintains a sorted bid/ask side, applies snapshot + incremental updates,
 * and computes liquidity-aware metrics:
 *   - best bid/ask, spread, mid
 *   - depth-weighted price (impact of trading N units)
 *   - cumulative depth at price levels (for the depth-chart UI)
 *   - book imbalance (sum bid size / sum (bid+ask) within the top-K)
 *
 * The orderbook is exchange-agnostic: BinanceFeedAdapter, BybitFeedAdapter,
 * OkxFeedAdapter, CoinbaseFeedAdapter all push updates into the same shape.
 */

export type Side = 'bid' | 'ask'

export interface Level {
  price: number
  size: number
}

export interface OrderBookState {
  symbol: string
  bids: Level[] // sorted descending by price
  asks: Level[] // sorted ascending by price
  /** Last update sequence id from the source feed (used to detect gaps). */
  lastUpdateId: number
  /** Source exchange identifier. */
  exchange: string
}

export function emptyBook(symbol: string, exchange: string): OrderBookState {
  return { symbol, bids: [], asks: [], lastUpdateId: 0, exchange }
}

/**
 * Apply a full snapshot, replacing both sides. Inputs do not need to be
 * sorted — we sort defensively.
 */
export function applySnapshot(
  book: OrderBookState,
  bids: Level[],
  asks: Level[],
  updateId: number,
): OrderBookState {
  return {
    ...book,
    bids: [...bids].sort((a, b) => b.price - a.price),
    asks: [...asks].sort((a, b) => a.price - b.price),
    lastUpdateId: updateId,
  }
}

/**
 * Apply an incremental L2 diff. Levels with size = 0 are deletions; any
 * non-zero size replaces the resting size at that price.
 */
export function applyDelta(
  book: OrderBookState,
  bidDeltas: Level[],
  askDeltas: Level[],
  updateId: number,
): OrderBookState {
  return {
    ...book,
    bids: mergeSide(book.bids, bidDeltas, 'bid'),
    asks: mergeSide(book.asks, askDeltas, 'ask'),
    lastUpdateId: updateId,
  }
}

function mergeSide(existing: Level[], deltas: Level[], side: Side): Level[] {
  const map = new Map<number, number>()
  for (const lvl of existing) map.set(lvl.price, lvl.size)
  for (const d of deltas) {
    if (d.size === 0) map.delete(d.price)
    else map.set(d.price, d.size)
  }
  const arr: Level[] = Array.from(map.entries()).map(([price, size]) => ({ price, size }))
  arr.sort((a, b) => (side === 'bid' ? b.price - a.price : a.price - b.price))
  return arr
}

// ---------- Analytics ----------

export interface BookSummary {
  bestBid: number | null
  bestAsk: number | null
  spread: number | null
  spreadBps: number | null
  mid: number | null
  bidVolumeTopK: number
  askVolumeTopK: number
  /** Σ bid / (Σ bid + Σ ask) within top K levels. 0.5 = balanced. */
  imbalance: number
}

export function summarize(book: OrderBookState, topK = 10): BookSummary {
  const bestBid = book.bids[0]?.price ?? null
  const bestAsk = book.asks[0]?.price ?? null
  const spread = bestBid !== null && bestAsk !== null ? bestAsk - bestBid : null
  const mid = bestBid !== null && bestAsk !== null ? (bestBid + bestAsk) / 2 : null
  const spreadBps = spread !== null && mid !== null && mid > 0 ? (spread / mid) * 10000 : null
  const bidVolumeTopK = sumSize(book.bids.slice(0, topK))
  const askVolumeTopK = sumSize(book.asks.slice(0, topK))
  const totalTopK = bidVolumeTopK + askVolumeTopK
  const imbalance = totalTopK === 0 ? 0.5 : bidVolumeTopK / totalTopK
  return {
    bestBid,
    bestAsk,
    spread,
    spreadBps,
    mid,
    bidVolumeTopK,
    askVolumeTopK,
    imbalance,
  }
}

/**
 * Compute the average fill price for a market order of `quantity` base
 * units, walking the book level-by-level. Returns null if the book is
 * thinner than `quantity`.
 */
export function depthWeightedPrice(
  book: OrderBookState,
  side: Side,
  quantity: number,
): { avgPrice: number; consumedLevels: number } | null {
  const levels = side === 'bid' ? book.asks : book.bids // taking the opposite side
  let remaining = quantity
  let cost = 0
  let consumed = 0
  for (const lvl of levels) {
    const take = Math.min(remaining, lvl.size)
    cost += take * lvl.price
    remaining -= take
    consumed++
    if (remaining <= 1e-12) break
  }
  if (remaining > 1e-9) return null
  return { avgPrice: cost / quantity, consumedLevels: consumed }
}

/**
 * Cumulative-depth shape for the depth-chart UI. Returns a series of
 * {price, cumulativeSize} on each side, capped at `maxLevels` entries.
 */
export interface DepthChartPoint {
  price: number
  cumulativeSize: number
  side: Side
}

export function depthChartData(book: OrderBookState, maxLevels = 50): DepthChartPoint[] {
  const out: DepthChartPoint[] = []
  let cumBid = 0
  for (const lvl of book.bids.slice(0, maxLevels)) {
    cumBid += lvl.size
    out.push({ price: lvl.price, cumulativeSize: cumBid, side: 'bid' })
  }
  let cumAsk = 0
  for (const lvl of book.asks.slice(0, maxLevels)) {
    cumAsk += lvl.size
    out.push({ price: lvl.price, cumulativeSize: cumAsk, side: 'ask' })
  }
  return out
}

function sumSize(levels: Level[]): number {
  let s = 0
  for (const l of levels) s += l.size
  return s
}
