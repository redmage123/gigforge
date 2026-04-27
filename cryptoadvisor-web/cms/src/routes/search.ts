import type { Endpoint, PayloadRequest } from 'payload'
import { errorResponse } from './_errors'

interface SignalDoc {
  id: string | number
  assetSymbol: string
  assetName: string
  direction: 'BUY' | 'SELL' | 'HOLD'
  confidence: number
  reason: string
  generatedAt: string
}

interface ScoredSignal extends SignalDoc {
  score: number
  matchedFields: string[]
}

const VALID_DIRECTIONS = new Set(['BUY', 'SELL', 'HOLD'])

export const searchRoute: Endpoint = {
  path: '/search',
  method: 'get',
  handler: async (req: PayloadRequest): Promise<Response> => {
    if (!req.url) {
      return errorResponse(400, 'Bad request')
    }

    const url = new URL(req.url)
    const q = (url.searchParams.get('q') ?? '').trim()
    const direction = url.searchParams.get('direction')
    const limitRaw = url.searchParams.get('limit')
    const minConfRaw = url.searchParams.get('minConfidence')

    const fieldErrors: { field: string; message: string }[] = []

    if (!q) {
      fieldErrors.push({ field: 'q', message: 'q is required' })
    }

    if (direction !== null && !VALID_DIRECTIONS.has(direction)) {
      fieldErrors.push({
        field: 'direction',
        message: 'direction must be BUY, SELL, or HOLD',
      })
    }

    let limit = 10
    if (limitRaw !== null) {
      const parsed = Number.parseInt(limitRaw, 10)
      if (!Number.isFinite(parsed) || parsed < 1 || parsed > 50) {
        fieldErrors.push({
          field: 'limit',
          message: 'limit must be an integer between 1 and 50',
        })
      } else {
        limit = parsed
      }
    }

    let minConfidence = 0
    if (minConfRaw !== null) {
      const parsed = Number.parseInt(minConfRaw, 10)
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
        fieldErrors.push({
          field: 'minConfidence',
          message: 'minConfidence must be an integer between 0 and 100',
        })
      } else {
        minConfidence = parsed
      }
    }

    if (fieldErrors.length > 0) {
      return errorResponse(422, 'Invalid query parameters', fieldErrors)
    }

    const result = await req.payload.find({
      collection: 'signals',
      limit: 1000,
    })

    const signals = result.docs as unknown as SignalDoc[]
    const scored = scoreSignals(signals, q, direction, minConfidence)

    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return b.confidence - a.confidence
    })

    const trimmed = scored.slice(0, limit)

    return Response.json({
      query: q,
      direction: direction ?? null,
      minConfidence,
      results: trimmed,
      count: trimmed.length,
    })
  },
}

export function scoreSignals(
  signals: SignalDoc[],
  q: string,
  direction: string | null,
  minConfidence: number,
): ScoredSignal[] {
  const needle = q.toLowerCase()
  const out: ScoredSignal[] = []

  for (const sig of signals) {
    if (direction && sig.direction !== direction) continue
    if (sig.confidence < minConfidence) continue

    let score = 0
    const matchedFields: string[] = []

    if (sig.assetSymbol.toLowerCase().includes(needle)) {
      score += 2
      matchedFields.push('assetSymbol')
    }
    if (sig.assetName.toLowerCase().includes(needle)) {
      score += 1.5
      matchedFields.push('assetName')
    }
    if (sig.reason.toLowerCase().includes(needle)) {
      score += 1
      matchedFields.push('reason')
    }

    if (score > 0) {
      out.push({ ...sig, score, matchedFields })
    }
  }

  return out
}
