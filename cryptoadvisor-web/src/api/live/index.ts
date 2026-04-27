/**
 * Live data source toggle.
 *
 * VITE_LIVE_PRICES=1 enables the CoinGecko adapter for /charts and Dashboard
 * featured chart. When unset (default), the deterministic mock layer is used
 * so demos remain offline-capable.
 */
import type { Asset, PriceData, Timeframe } from '../../types/index'
import { fetchPrices as cgFetch, CoinGeckoError } from './coingecko'
import { getPrices as mockPrices } from '../mock/prices'

const RAW = (import.meta.env.VITE_LIVE_PRICES ?? '').trim().toLowerCase()
export const LIVE_PRICES_ENABLED = RAW === '1' || RAW === 'true'

export type DataSource = 'mock' | 'live'

export function dataSource(): DataSource {
  return LIVE_PRICES_ENABLED ? 'live' : 'mock'
}

/**
 * Returns price data from CoinGecko if enabled, else from the mock layer.
 * On CoinGecko failure (network, 429), falls back to mock data so the UI
 * never breaks.
 */
export async function getPricesSmart(
  asset: Asset,
  timeframe: Timeframe,
): Promise<{ data: PriceData; source: DataSource }> {
  if (!LIVE_PRICES_ENABLED) {
    return { data: await mockPrices(asset, timeframe), source: 'mock' }
  }

  try {
    return { data: await cgFetch(asset, timeframe), source: 'live' }
  } catch (err) {
    if (!(err instanceof CoinGeckoError)) throw err
    // Rate-limited or upstream issue → fall back to mock so UX survives.
    return { data: await mockPrices(asset, timeframe), source: 'mock' }
  }
}
