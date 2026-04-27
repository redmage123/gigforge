import type { Endpoint, PayloadRequest, Where } from 'payload'
import { errorResponse } from './_errors'

interface AssetDoc {
  id: string | number
  name: string
  symbol: string
  description?: string
  riskTier: 'low' | 'medium' | 'high'
  marketCapTier: 'large' | 'mid' | 'small'
  chain?: string
  exchanges?: { name: string }[]
  isActive: boolean
}

interface SignalDoc {
  direction: 'BUY' | 'SELL' | 'HOLD'
  assetSymbol: string
}

interface SignalsSummary {
  total: number
  BUY: number
  SELL: number
  HOLD: number
}

const VALID_RISK_TIERS = new Set(['low', 'medium', 'high'])
const VALID_MARKET_CAP_TIERS = new Set(['large', 'mid', 'small'])

export const assetLookupRoute: Endpoint = {
  path: '/assets/:symbol',
  method: 'get',
  handler: async (req: PayloadRequest): Promise<Response> => {
    const symbolParam = (req.routeParams?.symbol as string | undefined) ?? ''
    if (!symbolParam) {
      return errorResponse(400, 'symbol is required')
    }

    const symbol = symbolParam.toUpperCase()

    const result = await req.payload.find({
      collection: 'assets',
      where: {
        and: [
          { symbol: { equals: symbol } },
          { isActive: { equals: true } },
        ],
      },
      limit: 1,
    })

    if (result.totalDocs === 0) {
      return errorResponse(404, `Asset not found: ${symbol}`)
    }

    const asset = result.docs[0] as unknown as AssetDoc

    const signalsResult = await req.payload.find({
      collection: 'signals',
      where: { assetSymbol: { equals: symbol } },
      limit: 1000,
    })

    const summary = summariseSignals(signalsResult.docs as unknown as SignalDoc[])

    return Response.json({
      ...asset,
      signalsSummary: summary,
    })
  },
}

export const assetCatalogueRoute: Endpoint = {
  path: '/assets',
  method: 'get',
  handler: async (req: PayloadRequest): Promise<Response> => {
    if (!req.url) {
      return errorResponse(400, 'Bad request')
    }

    const url = new URL(req.url)
    const riskTier = url.searchParams.get('riskTier')
    const marketCapTier = url.searchParams.get('marketCapTier')
    const q = url.searchParams.get('q')

    const fieldErrors: { field: string; message: string }[] = []
    if (riskTier && !VALID_RISK_TIERS.has(riskTier)) {
      fieldErrors.push({
        field: 'riskTier',
        message: 'riskTier must be low, medium, or high',
      })
    }
    if (marketCapTier && !VALID_MARKET_CAP_TIERS.has(marketCapTier)) {
      fieldErrors.push({
        field: 'marketCapTier',
        message: 'marketCapTier must be large, mid, or small',
      })
    }
    if (fieldErrors.length > 0) {
      return errorResponse(422, 'Invalid query parameters', fieldErrors)
    }

    const conditions: Where[] = [{ isActive: { equals: true } }]
    if (riskTier) conditions.push({ riskTier: { equals: riskTier } })
    if (marketCapTier) conditions.push({ marketCapTier: { equals: marketCapTier } })

    const result = await req.payload.find({
      collection: 'assets',
      where: { and: conditions },
      limit: 1000,
    })

    let assets = result.docs as unknown as AssetDoc[]

    if (q) {
      const needle = q.toLowerCase()
      assets = assets.filter(
        (a) =>
          a.name.toLowerCase().includes(needle) ||
          a.symbol.toLowerCase().includes(needle),
      )
    }

    return Response.json({
      assets,
      count: assets.length,
    })
  },
}

export function summariseSignals(signals: SignalDoc[]): SignalsSummary {
  const summary: SignalsSummary = { total: 0, BUY: 0, SELL: 0, HOLD: 0 }
  for (const sig of signals) {
    summary.total += 1
    summary[sig.direction] += 1
  }
  return summary
}
