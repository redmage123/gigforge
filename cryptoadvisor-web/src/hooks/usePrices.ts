import { useQuery } from '@tanstack/react-query'
import { getPrices } from '../api/index'
import type { Asset, Timeframe } from '../types/index'

export function usePrices(asset: Asset, timeframe: Timeframe) {
  return useQuery({
    queryKey: ['prices', asset, timeframe],
    queryFn: () => getPrices(asset, timeframe),
  })
}
