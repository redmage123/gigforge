import { describe, expect, test, vi } from 'vitest'
import type { PayloadRequest } from 'payload'
import { searchRoute, scoreSignals } from './search'

const SAMPLE_SIGNALS = [
  {
    id: '1',
    assetSymbol: 'BTC',
    assetName: 'Bitcoin',
    direction: 'BUY' as const,
    confidence: 82,
    reason: 'On-chain accumulation by long-term holders increasing.',
    generatedAt: '2026-03-23T00:00:00.000Z',
  },
  {
    id: '2',
    assetSymbol: 'ETH',
    assetName: 'Ethereum',
    direction: 'HOLD' as const,
    confidence: 61,
    reason: 'Price consolidating; gas fees trending down.',
    generatedAt: '2026-03-23T00:00:00.000Z',
  },
  {
    id: '3',
    assetSymbol: 'BTC',
    assetName: 'Bitcoin',
    direction: 'SELL' as const,
    confidence: 50,
    reason: 'Profit-taking signal.',
    generatedAt: '2026-03-23T00:00:00.000Z',
  },
]

function makeReq(qs: string): PayloadRequest {
  const find = vi.fn().mockResolvedValue({ docs: SAMPLE_SIGNALS, totalDocs: SAMPLE_SIGNALS.length })
  return {
    url: `http://localhost/api/search${qs}`,
    payload: { find } as unknown as PayloadRequest['payload'],
  } as unknown as PayloadRequest
}

async function jsonOf(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>
}

describe('searchRoute', () => {
  test('q=bitcoin → BTC signals ranked first', async () => {
    const res = await searchRoute.handler(makeReq('?q=bitcoin'))
    expect(res.status).toBe(200)
    const body = await jsonOf(res)
    expect(body.count).toBe(2)
    const results = body.results as Array<{ assetSymbol: string }>
    expect(results[0].assetSymbol).toBe('BTC')
  })

  test('q=bitcoin&direction=SELL → only SELL', async () => {
    const res = await searchRoute.handler(makeReq('?q=bitcoin&direction=SELL'))
    expect(res.status).toBe(200)
    const body = await jsonOf(res)
    const results = body.results as Array<{ direction: string }>
    expect(results).toHaveLength(1)
    expect(results[0].direction).toBe('SELL')
  })

  test('q=bitcoin&minConfidence=70 → high-confidence only', async () => {
    const res = await searchRoute.handler(makeReq('?q=bitcoin&minConfidence=70'))
    const body = await jsonOf(res)
    const results = body.results as Array<{ confidence: number }>
    expect(results).toHaveLength(1)
    expect(results[0].confidence).toBe(82)
  })

  test('missing q → 422', async () => {
    const res = await searchRoute.handler(makeReq(''))
    expect(res.status).toBe(422)
    const body = await jsonOf(res)
    const err = body.error as { errors: Array<{ field: string }> }
    expect(err.errors[0].field).toBe('q')
  })

  test('no match → 200 empty', async () => {
    const res = await searchRoute.handler(makeReq('?q=nomatch'))
    expect(res.status).toBe(200)
    const body = await jsonOf(res)
    expect(body.count).toBe(0)
    expect(body.results).toEqual([])
  })

  test('limit=1 → at most 1 result', async () => {
    const res = await searchRoute.handler(makeReq('?q=bitcoin&limit=1'))
    const body = await jsonOf(res)
    expect((body.results as unknown[]).length).toBeLessThanOrEqual(1)
  })

  test('invalid direction → 422', async () => {
    const res = await searchRoute.handler(makeReq('?q=bitcoin&direction=INVALID'))
    expect(res.status).toBe(422)
  })

  test('limit > 50 → 422', async () => {
    const res = await searchRoute.handler(makeReq('?q=bitcoin&limit=51'))
    expect(res.status).toBe(422)
  })
})

describe('scoreSignals', () => {
  test('symbol match scores highest', () => {
    const scored = scoreSignals(SAMPLE_SIGNALS, 'BTC', null, 0)
    const btc = scored.find((s) => s.assetSymbol === 'BTC')
    expect(btc?.score).toBeGreaterThanOrEqual(2)
    expect(btc?.matchedFields).toContain('assetSymbol')
  })

  test('matches across multiple fields sum scores', () => {
    const scored = scoreSignals(
      [{ ...SAMPLE_SIGNALS[0], reason: 'BTC accumulation Bitcoin signal' }],
      'bitcoin',
      null,
      0,
    )
    expect(scored[0].matchedFields).toEqual(
      expect.arrayContaining(['assetName', 'reason']),
    )
    expect(scored[0].score).toBe(2.5)
  })

  test('sort: by score desc then confidence desc', () => {
    const scored = scoreSignals(SAMPLE_SIGNALS, 'bitcoin', null, 0)
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return b.confidence - a.confidence
    })
    expect(scored[0].confidence).toBeGreaterThanOrEqual(scored[1].confidence)
  })
})
