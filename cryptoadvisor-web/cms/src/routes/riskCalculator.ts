import type { Endpoint, PayloadRequest } from 'payload'
import { computeRisk, parseAllocations } from './riskCalculator.service'
import { errorResponse } from './_errors'

export const riskCalculatorRoute: Endpoint = {
  path: '/calculator/risk',
  method: 'get',
  handler: async (req: PayloadRequest): Promise<Response> => {
    if (!req.url) {
      return errorResponse(400, 'Bad request')
    }

    const url = new URL(req.url)
    const raw = url.searchParams.get('allocations')
    const currency = url.searchParams.get('currency') ?? 'USD'

    if (!raw) {
      return errorResponse(422, 'Invalid query parameters', [
        { field: 'allocations', message: 'allocations is required' },
      ])
    }

    const parsed = parseAllocations(raw)
    if (!parsed.ok) {
      return errorResponse(422, 'Invalid query parameters', [
        { field: 'allocations', message: parsed.error.message },
      ])
    }

    const result = computeRisk(parsed.allocations)

    return Response.json({
      currency,
      ...result,
    })
  },
}
