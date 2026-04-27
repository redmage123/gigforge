import { useQuery } from '@tanstack/react-query'
import { getAssetBySymbol, useCmsApi } from '../api/cms/client'

export function useAsset(symbol: string | null) {
  const cmsAvailable = useCmsApi()
  return useQuery({
    queryKey: ['cms', 'asset', symbol],
    queryFn: () => getAssetBySymbol(symbol as string),
    enabled: cmsAvailable && symbol !== null && symbol.length > 0,
    staleTime: 60_000,
  })
}
