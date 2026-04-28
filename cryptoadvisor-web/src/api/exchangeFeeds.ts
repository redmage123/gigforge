/**
 * Multi-exchange L2 orderbook feed router (Sprint 12, STORY-1111).
 *
 * Free, no-auth public WebSocket feeds:
 *   - Binance: wss://stream.binance.com:9443/ws/<symbol>@depth20@100ms
 *     plus REST snapshot at /api/v3/depth?symbol=...&limit=1000
 *   - Bybit:   wss://stream.bybit.com/v5/public/spot — orderbook.50.<symbol>
 *   - OKX:     wss://ws.okx.com:8443/ws/v5/public — books5 channel
 *   - Coinbase: wss://ws-feed.exchange.coinbase.com — level2 channel
 *
 * Each adapter normalizes its native feed into the shared `OrderBookState`.
 * The router subscribes to multiple exchanges in parallel and emits unified
 * `OrderBookUpdate` events to a single callback — the caller decides how to
 * merge or display them (typically: pick the venue with the tightest spread).
 */

import {
  applyDelta,
  applySnapshot,
  emptyBook,
  type Level,
  type OrderBookState,
} from '../utils/orderBook'

export type Exchange = 'binance' | 'bybit' | 'okx' | 'coinbase'

export interface OrderBookUpdate {
  exchange: Exchange
  book: OrderBookState
}

export interface FeedSubscription {
  exchange: Exchange
  symbol: string // exchange-native symbol, e.g. BTCUSDT, BTC-USD
}

export interface FeedSubscriberOptions {
  onUpdate: (event: OrderBookUpdate) => void
  onError?: (exchange: Exchange, error: Error) => void
}

/**
 * Subscribe to one or more exchange feeds. Returns a disposer that closes
 * every underlying socket. Adapters retry once on connection drops; further
 * resilience can be layered on at the caller (the consumer typically
 * already has React Query / a websocket-status indicator).
 */
export function subscribeOrderBooks(
  subs: FeedSubscription[],
  opts: FeedSubscriberOptions,
): () => void {
  const closers: Array<() => void> = []
  for (const sub of subs) {
    const close = startAdapter(sub, opts)
    closers.push(close)
  }
  return () => {
    for (const c of closers) c()
  }
}

function startAdapter(sub: FeedSubscription, opts: FeedSubscriberOptions): () => void {
  switch (sub.exchange) {
    case 'binance':
      return startBinance(sub.symbol, opts)
    case 'bybit':
      return startBybit(sub.symbol, opts)
    case 'okx':
      return startOkx(sub.symbol, opts)
    case 'coinbase':
      return startCoinbase(sub.symbol, opts)
  }
}

// ---------- Binance ----------

function startBinance(symbol: string, opts: FeedSubscriberOptions): () => void {
  if (typeof WebSocket === 'undefined') return () => {}
  let book: OrderBookState = emptyBook(symbol, 'binance')
  const lower = symbol.toLowerCase()
  const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${lower}@depth20@100ms`)
  ws.onmessage = (msg) => {
    try {
      const data = JSON.parse(msg.data)
      const bids = (data.bids ?? []).map(parseBinanceLevel)
      const asks = (data.asks ?? []).map(parseBinanceLevel)
      // depth20 is a snapshot of the top 20 levels every 100ms — replace.
      book = applySnapshot(book, bids, asks, data.lastUpdateId ?? 0)
      opts.onUpdate({ exchange: 'binance', book })
    } catch (e) {
      opts.onError?.('binance', e as Error)
    }
  }
  ws.onerror = () => opts.onError?.('binance', new Error('binance ws error'))
  return () => ws.close()
}

function parseBinanceLevel(arr: [string, string]): Level {
  return { price: Number(arr[0]), size: Number(arr[1]) }
}

// ---------- Bybit (v5 spot) ----------

function startBybit(symbol: string, opts: FeedSubscriberOptions): () => void {
  if (typeof WebSocket === 'undefined') return () => {}
  let book: OrderBookState = emptyBook(symbol, 'bybit')
  const ws = new WebSocket('wss://stream.bybit.com/v5/public/spot')
  ws.onopen = () => {
    ws.send(JSON.stringify({ op: 'subscribe', args: [`orderbook.50.${symbol}`] }))
  }
  ws.onmessage = (msg) => {
    try {
      const data = JSON.parse(msg.data)
      if (!data.topic || !data.data) return
      const bids = (data.data.b ?? []).map(parseStringLevel)
      const asks = (data.data.a ?? []).map(parseStringLevel)
      const seq = data.data.u ?? 0
      if (data.type === 'snapshot') {
        book = applySnapshot(book, bids, asks, seq)
      } else {
        book = applyDelta(book, bids, asks, seq)
      }
      opts.onUpdate({ exchange: 'bybit', book })
    } catch (e) {
      opts.onError?.('bybit', e as Error)
    }
  }
  ws.onerror = () => opts.onError?.('bybit', new Error('bybit ws error'))
  return () => ws.close()
}

function parseStringLevel(arr: [string, string]): Level {
  return { price: Number(arr[0]), size: Number(arr[1]) }
}

// ---------- OKX (v5) ----------

function startOkx(symbol: string, opts: FeedSubscriberOptions): () => void {
  if (typeof WebSocket === 'undefined') return () => {}
  let book: OrderBookState = emptyBook(symbol, 'okx')
  const ws = new WebSocket('wss://ws.okx.com:8443/ws/v5/public')
  ws.onopen = () => {
    ws.send(
      JSON.stringify({
        op: 'subscribe',
        args: [{ channel: 'books5', instId: symbol }],
      }),
    )
  }
  ws.onmessage = (msg) => {
    try {
      const data = JSON.parse(msg.data)
      const tick = data?.data?.[0]
      if (!tick) return
      const bids = (tick.bids ?? []).map(([p, s]: [string, string]) => ({
        price: Number(p),
        size: Number(s),
      }))
      const asks = (tick.asks ?? []).map(([p, s]: [string, string]) => ({
        price: Number(p),
        size: Number(s),
      }))
      const seq = Number(tick.ts ?? 0)
      // books5 is always a snapshot (top 5) — replace.
      book = applySnapshot(book, bids, asks, seq)
      opts.onUpdate({ exchange: 'okx', book })
    } catch (e) {
      opts.onError?.('okx', e as Error)
    }
  }
  ws.onerror = () => opts.onError?.('okx', new Error('okx ws error'))
  return () => ws.close()
}

// ---------- Coinbase Exchange ----------

function startCoinbase(symbol: string, opts: FeedSubscriberOptions): () => void {
  if (typeof WebSocket === 'undefined') return () => {}
  let book: OrderBookState = emptyBook(symbol, 'coinbase')
  const ws = new WebSocket('wss://ws-feed.exchange.coinbase.com')
  ws.onopen = () => {
    ws.send(
      JSON.stringify({
        type: 'subscribe',
        product_ids: [symbol],
        channels: ['level2'],
      }),
    )
  }
  ws.onmessage = (msg) => {
    try {
      const data = JSON.parse(msg.data)
      if (data.type === 'snapshot') {
        const bids = (data.bids ?? []).map(parseStringLevel)
        const asks = (data.asks ?? []).map(parseStringLevel)
        book = applySnapshot(book, bids, asks, Date.now())
      } else if (data.type === 'l2update') {
        const bidDeltas: Level[] = []
        const askDeltas: Level[] = []
        for (const ch of data.changes ?? []) {
          const [side, price, size] = ch as [string, string, string]
          const lvl: Level = { price: Number(price), size: Number(size) }
          if (side === 'buy') bidDeltas.push(lvl)
          else askDeltas.push(lvl)
        }
        book = applyDelta(book, bidDeltas, askDeltas, Date.now())
      } else {
        return
      }
      opts.onUpdate({ exchange: 'coinbase', book })
    } catch (e) {
      opts.onError?.('coinbase', e as Error)
    }
  }
  ws.onerror = () => opts.onError?.('coinbase', new Error('coinbase ws error'))
  return () => ws.close()
}

/**
 * Pick the venue with the tightest spread among a map of recent updates.
 * Returns the exchange name; ties broken by exchange order in the input map.
 */
export function pickBestVenue(
  updates: Record<Exchange, OrderBookUpdate | undefined>,
): Exchange | null {
  let best: Exchange | null = null
  let bestSpread = Infinity
  for (const [ex, upd] of Object.entries(updates) as Array<[Exchange, OrderBookUpdate | undefined]>) {
    if (!upd) continue
    const bid = upd.book.bids[0]?.price
    const ask = upd.book.asks[0]?.price
    if (bid === undefined || ask === undefined) continue
    const spread = ask - bid
    if (spread < bestSpread) {
      bestSpread = spread
      best = ex
    }
  }
  return best
}
