/**
 * Binance public WebSocket ticker subscriber.
 *
 * Stream: wss://stream.binance.com:9443/stream?streams=btcusdt@trade/ethusdt@trade/...
 *
 * Reconnects with exponential backoff. Last-trade price for each symbol is
 * pushed to the listener; the listener decides whether to render it.
 */
import type { Asset } from '../../types/index'

const ENDPOINT = 'wss://stream.binance.com:9443/stream'

const ASSET_TO_STREAM: Record<Asset, string> = {
  BTC: 'btcusdt@trade',
  ETH: 'ethusdt@trade',
  SOL: 'solusdt@trade',
  ADA: 'adausdt@trade',
}

const STREAM_TO_ASSET: Record<string, Asset> = {
  btcusdt: 'BTC',
  ethusdt: 'ETH',
  solusdt: 'SOL',
  adausdt: 'ADA',
}

export interface TickerUpdate {
  asset: Asset
  price: number
  quantity: number
  timestamp: number
}

export type TickerListener = (update: TickerUpdate) => void

interface BinanceTradeMsg {
  stream: string
  data: {
    e: string // event type
    E: number // event time
    s: string // symbol
    p: string // price
    q: string // quantity
  }
}

/**
 * Subscribe to live trade updates for the given assets.
 * Returns an unsubscribe function. Reconnects automatically on disconnect
 * with exponential backoff capped at 30 s.
 */
export function subscribeTickers(
  assets: Asset[],
  listener: TickerListener,
): () => void {
  if (assets.length === 0) return () => {}

  const streams = assets.map((a) => ASSET_TO_STREAM[a]).join('/')
  const url = `${ENDPOINT}?streams=${streams}`

  let ws: WebSocket | null = null
  let closed = false
  let backoffMs = 1_000
  let retryTimer: ReturnType<typeof setTimeout> | null = null

  function connect(): void {
    if (closed) return
    ws = new WebSocket(url)

    ws.addEventListener('open', () => {
      backoffMs = 1_000
    })

    ws.addEventListener('message', (event) => {
      try {
        const msg = JSON.parse(event.data) as BinanceTradeMsg
        const symbol = msg.data?.s?.toLowerCase()
        const asset = STREAM_TO_ASSET[symbol]
        if (!asset) return
        listener({
          asset,
          price: Number(msg.data.p),
          quantity: Number(msg.data.q),
          timestamp: msg.data.E,
        })
      } catch {
        // ignore malformed frames
      }
    })

    ws.addEventListener('close', () => {
      if (closed) return
      retryTimer = setTimeout(connect, backoffMs)
      backoffMs = Math.min(backoffMs * 2, 30_000)
    })

    ws.addEventListener('error', () => {
      ws?.close()
    })
  }

  connect()

  return () => {
    closed = true
    if (retryTimer) clearTimeout(retryTimer)
    ws?.close()
  }
}
