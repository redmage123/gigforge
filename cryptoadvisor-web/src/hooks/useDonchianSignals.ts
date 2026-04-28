/**
 * Donchian-driven signal hook (Sprint 9, STORY-907).
 *
 * Fetches OHLCV candles for each tracked asset, runs the Donchian breakout
 * detector, and shapes the output to match the editorial `Signal` interface
 * so the existing Signals UI can render both side-by-side.
 */
import { useQueries } from '@tanstack/react-query'
import { getPrices } from '../api/index'
import { generateDonchianSignals, toEditorialSignal } from '../utils/signalGenerator'
import type { Asset, Signal } from '../types/index'

const TRACKED_ASSETS: Asset[] = ['BTC', 'ETH', 'SOL', 'ADA']


export function useDonchianSignals() {
  const queries = useQueries({
    queries: TRACKED_ASSETS.map((asset) => ({
      queryKey: ['prices', asset, '1M'],
      queryFn: () => getPrices(asset, '1M'),
    })),
  })

  const isLoading = queries.some((q) => q.isLoading)
  const isError = queries.some((q) => q.isError)
  const data: Array<Signal & { source: 'donchian' }> = []
  for (let i = 0; i < TRACKED_ASSETS.length; i++) {
    const q = queries[i]
    if (q.data) {
      const generated = generateDonchianSignals(q.data.candles, {
        symbol: TRACKED_ASSETS[i],
        period: 20,
      })
      // Only emit the most recent signal per asset to avoid flooding the feed.
      if (generated.length > 0) {
        data.push(toEditorialSignal(generated[generated.length - 1]))
      }
    }
  }

  return { data, isLoading, isError }
}
