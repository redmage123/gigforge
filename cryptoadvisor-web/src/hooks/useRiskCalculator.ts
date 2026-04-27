import { useMutation } from '@tanstack/react-query'
import { calculateRisk, type RiskAllocation, type RiskResponse } from '../api/cms/client'

export function useRiskCalculator() {
  return useMutation<RiskResponse, Error, { allocations: RiskAllocation[]; currency?: string }>({
    mutationFn: ({ allocations, currency }) => calculateRisk(allocations, currency),
  })
}
