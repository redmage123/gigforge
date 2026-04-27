import { useQuery } from '@tanstack/react-query'
import { dataSource, getPricesSmart, type DataSource } from '../api/live/index'
import type { Asset, PriceData, Timeframe } from '../types/index'

export interface SmartPriceResult {
  data: PriceData | undefined
  source: DataSource | null
  isLoading: boolean
  isError: boolean
}

/**
 * Returns OHLCV candles from the live source if enabled, else from mocks.
 * Exposes the actual source (mock / live) so the UI can render the
 * MOCK | LIVE badge accurately even when CoinGecko falls back to mock.
 */
export function usePricesSmart(asset: Asset, timeframe: Timeframe): SmartPriceResult {
  const query = useQuery({
    queryKey: ['prices-smart', dataSource(), asset, timeframe],
    queryFn: () => getPricesSmart(asset, timeframe),
    staleTime: 60_000,
  })

  return {
    data: query.data?.data,
    source: query.data?.source ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
  }
}
