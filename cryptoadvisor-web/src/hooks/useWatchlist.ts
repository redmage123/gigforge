import { useQuery } from '@tanstack/react-query'
import { getWatchlist } from '../api/index'

export function useWatchlist() {
  return useQuery({
    queryKey: ['watchlist'],
    queryFn: getWatchlist,
  })
}
