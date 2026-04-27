import { useQuery } from '@tanstack/react-query'
import { getSignals } from '../api/index'

export function useSignals() {
  return useQuery({
    queryKey: ['signals'],
    queryFn: getSignals,
  })
}
