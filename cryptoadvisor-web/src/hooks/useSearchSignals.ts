import { useQuery } from '@tanstack/react-query'
import { searchSignals, useCmsApi, type SearchOptions } from '../api/cms/client'

export function useSearchSignals(opts: SearchOptions, enabled = true) {
  const cmsAvailable = useCmsApi()
  return useQuery({
    queryKey: ['cms', 'search', opts],
    queryFn: () => searchSignals(opts),
    enabled: enabled && cmsAvailable && opts.q.trim().length > 0,
    staleTime: 30_000,
  })
}
