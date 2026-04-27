import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  addToWatchlist,
  listWatchlist,
  removeFromWatchlist,
  type WatchlistEntry,
} from '../api/cms/userState'
import { useCmsApi } from '../api/cms/client'

const KEY = ['cms', 'watchlist'] as const

export function usePersistedWatchlist() {
  const cmsAvailable = useCmsApi()
  return useQuery<WatchlistEntry[]>({
    queryKey: KEY,
    queryFn: () => listWatchlist(),
    enabled: cmsAvailable,
    staleTime: 30_000,
  })
}

export function useAddToWatchlist() {
  const qc = useQueryClient()
  return useMutation<WatchlistEntry, Error, { symbol: string; name: string }>({
    mutationFn: ({ symbol, name }) => addToWatchlist(symbol, name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY })
    },
  })
}

export function useRemoveFromWatchlist() {
  const qc = useQueryClient()
  return useMutation<void, Error, string>({
    mutationFn: (id) => removeFromWatchlist(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY })
    },
  })
}
