import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import {
  CmsError,
  calculateRisk,
  formatAllocations,
  getAssetBySymbol,
  listAssets,
  searchSignals,
  useCmsApi,
  CMS_BASE_URL,
} from './client'

describe('useCmsApi', () => {
  test('returns true when CMS_BASE_URL is set', () => {
    // Set in src/setupTests.ts via VITE_CMS_URL=http://localhost:3001
    expect(useCmsApi()).toBe(CMS_BASE_URL.length > 0)
  })
})

describe('formatAllocations', () => {
  test('joins symbol:pct pairs with commas', () => {
    expect(formatAllocations([
      { symbol: 'BTC', pct: 50 },
      { symbol: 'ETH', pct: 50 },
    ])).toBe('BTC:50,ETH:50')
  })

  test('handles single allocation', () => {
    expect(formatAllocations([{ symbol: 'BTC', pct: 100 }])).toBe('BTC:100')
  })
})

describe('searchSignals', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test('calls /api/search with query params', async () => {
    const mockResp = {
      query: 'bitcoin',
      direction: null,
      minConfidence: 0,
      results: [],
      count: 0,
    }
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => mockResp,
    } as Response)

    const result = await searchSignals({ q: 'bitcoin', direction: 'BUY', minConfidence: 70 })
    expect(result).toEqual(mockResp)
    expect((fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]).toEqual(
      expect.stringMatching(/\/api\/search\?q=bitcoin&direction=BUY&minConfidence=70/),
    )
  })

  test('throws CmsError on non-ok response', async () => {
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ error: { message: 'q is required' } }),
    } as Response)

    await expect(searchSignals({ q: '' })).rejects.toBeInstanceOf(CmsError)
  })
})

describe('calculateRisk', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test('calls /api/calculator/risk with allocations + currency', async () => {
    const mockResp = {
      currency: 'USD',
      allocations: [{ symbol: 'BTC', pct: 100 }],
      hhi: 1,
      diversificationScore: 0,
      riskTier: 'high',
      largestPosition: { symbol: 'BTC', pct: 100 },
      assetCount: 1,
      breakdown: 'HHI of 1.0000 indicates high concentration. BTC represents 100% of the portfolio.',
    }
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => mockResp,
    } as Response)

    const result = await calculateRisk([{ symbol: 'BTC', pct: 100 }])
    expect(result.hhi).toBe(1)
    expect((fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]).toEqual(
      expect.stringMatching(/\/api\/calculator\/risk\?allocations=BTC%3A100&currency=USD/),
    )
  })
})

describe('getAssetBySymbol', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test('encodes symbol in URL path', async () => {
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        id: '1',
        name: 'Bitcoin',
        symbol: 'BTC',
        riskTier: 'low',
        marketCapTier: 'large',
        isActive: true,
        signalsSummary: { total: 0, BUY: 0, SELL: 0, HOLD: 0 },
      }),
    } as Response)

    const asset = await getAssetBySymbol('BTC')
    expect(asset.symbol).toBe('BTC')
    expect((fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]).toEqual(expect.stringMatching(/\/api\/assets\/BTC$/))
  })

  test('throws CmsError 404 on unknown symbol', async () => {
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: { message: 'Asset not found: UNKNOWN' } }),
    } as Response)

    await expect(getAssetBySymbol('UNKNOWN')).rejects.toMatchObject({
      status: 404,
      name: 'CmsError',
    })
  })
})

describe('listAssets', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test('omits query string when no options provided', async () => {
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ assets: [], count: 0 }),
    } as Response)

    await listAssets()
    expect((fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]).toEqual(expect.stringMatching(/\/api\/assets$/))
  })

  test('passes filters as query params', async () => {
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ assets: [], count: 0 }),
    } as Response)

    await listAssets({ riskTier: 'low', marketCapTier: 'large', q: 'bit' })
    expect((fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]).toEqual(
      expect.stringMatching(/riskTier=low.*marketCapTier=large.*q=bit/),
    )
  })
})
