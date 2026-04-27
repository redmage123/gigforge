/**
 * CoinGecko free-tier price adapter.
 *
 * Endpoints used:
 *   GET /api/v3/coins/{id}/market_chart?vs_currency=usd&days={d}
 *
 * Rate limit: 30 calls/min on the public tier. We cache responses for 60 s
 * keyed by (asset, timeframe) to stay well under that.
 *
 * If a request fails (network, 429), the caller should fall back to the mock
 * layer so the UI never breaks.
 */
import type { Asset, OHLCVCandle, PriceData, Timeframe } from '../../types/index'

const BASE = 'https://api.coingecko.com/api/v3'

const COIN_IDS: Record<Asset, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  SOL: 'solana',
  ADA: 'cardano',
}

const TIMEFRAME_DAYS: Record<Timeframe, number> = {
  '1D': 1,
  '1W': 7,
  '1M': 30,
}

interface CacheEntry {
  data: PriceData
  expiresAt: number
}

const CACHE_TTL_MS = 60_000
const cache = new Map<string, CacheEntry>()

function cacheKey(asset: Asset, timeframe: Timeframe): string {
  return `${asset}:${timeframe}`
}

export class CoinGeckoError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'CoinGeckoError'
  }
}

/**
 * Fetch OHLCV candles from CoinGecko. Currently returns close-only data
 * (CoinGecko's free `market_chart` endpoint does not include OHLC);
 * we synthesize open=high=low=close so the chart still renders.
 *
 * Cached for 60 s per (asset, timeframe).
 */
export async function fetchPrices(asset: Asset, timeframe: Timeframe): Promise<PriceData> {
  const key = cacheKey(asset, timeframe)
  const hit = cache.get(key)
  if (hit && hit.expiresAt > Date.now()) {
    return hit.data
  }

  const coinId = COIN_IDS[asset]
  const days = TIMEFRAME_DAYS[timeframe]
  const url = `${BASE}/coins/${coinId}/market_chart?vs_currency=usd&days=${days}`
  const res = await fetch(url)
  if (!res.ok) {
    throw new CoinGeckoError(res.status, `CoinGecko ${res.status}`)
  }

  const body = (await res.json()) as {
    prices: [number, number][]
    total_volumes: [number, number][]
  }

  const candles: OHLCVCandle[] = body.prices.map(([ts, price], i) => {
    const volume = body.total_volumes[i]?.[1] ?? 0
    return {
      timestamp: ts,
      open: price,
      high: price,
      low: price,
      close: price,
      volume,
    }
  })

  const data: PriceData = { asset, timeframe, candles }
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS })
  return data
}

export function clearPriceCache(): void {
  cache.clear()
}
