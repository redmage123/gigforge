import { useQuery } from '@tanstack/react-query'
import { getPortfolio } from '../api/index'

export function usePortfolio() {
  return useQuery({
    queryKey: ['portfolio'],
    queryFn: getPortfolio,
  })
}
