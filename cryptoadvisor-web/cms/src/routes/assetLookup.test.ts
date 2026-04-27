import { describe, expect, test, vi } from 'vitest'
import type { PayloadRequest } from 'payload'
import {
  assetCatalogueRoute,
  assetLookupRoute,
  summariseSignals,
} from './assetLookup'

const BTC = {
  id: '1',
  name: 'Bitcoin',
  symbol: 'BTC',
  description: 'Original digital cash.',
  riskTier: 'low' as const,
  marketCapTier: 'large' as const,
  chain: 'Bitcoin',
  exchanges: [{ name: 'Binance' }],
  isActive: true,
}

const ETH = {
  id: '2',
  name: 'Ethereum',
  symbol: 'ETH',
  riskTier: 'low' as const,
  marketCapTier: 'large' as const,
  isActive: true,
}

const BTC_SIGNALS = [
  { direction: 'BUY' as const, assetSymbol: 'BTC' },
  { direction: 'BUY' as const, assetSymbol: 'BTC' },
  { direction: 'HOLD' as const, assetSymbol: 'BTC' },
]

function makeLookupReq(symbol: string, assets: unknown[], signals: unknown[]): PayloadRequest {
  const find = vi
    .fn()
    .mockResolvedValueOnce({ docs: assets, totalDocs: assets.length })
    .mockResolvedValueOnce({ docs: signals, totalDocs: signals.length })
  return {
    url: `http://localhost/api/assets/${symbol}`,
    routeParams: { symbol },
    payload: { find } as unknown as PayloadRequest['payload'],
  } as unknown as PayloadRequest
}

function makeCatalogueReq(qs: string, assets: unknown[]): PayloadRequest {
  const find = vi.fn().mockResolvedValue({ docs: assets, totalDocs: assets.length })
  return {
    url: `http://localhost/api/assets${qs}`,
    payload: { find } as unknown as PayloadRequest['payload'],
  } as unknown as PayloadRequest
}

async function jsonOf(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>
}

describe('assetLookupRoute (/:symbol)', () => {
  test('GET /assets/BTC → 200 with signalsSummary', async () => {
    const res = await assetLookupRoute.handler(makeLookupReq('BTC', [BTC], BTC_SIGNALS))
    expect(res.status).toBe(200)
    const body = await jsonOf(res)
    expect(body.symbol).toBe('BTC')
    expect(body.signalsSummary).toEqual({ total: 3, BUY: 2, SELL: 0, HOLD: 1 })
  })

  test('GET /assets/btc → 200 (case-insensitive)', async () => {
    const res = await assetLookupRoute.handler(makeLookupReq('btc', [BTC], BTC_SIGNALS))
    expect(res.status).toBe(200)
    const body = await jsonOf(res)
    expect(body.symbol).toBe('BTC')
  })

  test('GET /assets/UNKNOWN → 404', async () => {
    const res = await assetLookupRoute.handler(makeLookupReq('UNKNOWN', [], []))
    expect(res.status).toBe(404)
  })
})

describe('assetCatalogueRoute (/)', () => {
  test('GET /assets → 200 with all assets', async () => {
    const res = await assetCatalogueRoute.handler(makeCatalogueReq('', [BTC, ETH]))
    const body = await jsonOf(res)
    expect(body.count).toBe(2)
  })

  test('GET /assets?q=bit → matches Bitcoin', async () => {
    const res = await assetCatalogueRoute.handler(makeCatalogueReq('?q=bit', [BTC, ETH]))
    const body = await jsonOf(res)
    const assets = body.assets as Array<{ symbol: string }>
    expect(assets).toHaveLength(1)
    expect(assets[0].symbol).toBe('BTC')
  })

  test('GET /assets?riskTier=invalid → 422', async () => {
    const res = await assetCatalogueRoute.handler(makeCatalogueReq('?riskTier=bogus', []))
    expect(res.status).toBe(422)
  })

  test('GET /assets?marketCapTier=invalid → 422', async () => {
    const res = await assetCatalogueRoute.handler(makeCatalogueReq('?marketCapTier=bogus', []))
    expect(res.status).toBe(422)
  })
})

describe('summariseSignals', () => {
  test('counts by direction', () => {
    expect(summariseSignals(BTC_SIGNALS)).toEqual({
      total: 3,
      BUY: 2,
      SELL: 0,
      HOLD: 1,
    })
  })

  test('empty input → zeros', () => {
    expect(summariseSignals([])).toEqual({ total: 0, BUY: 0, SELL: 0, HOLD: 0 })
  })
})
