/**
 * CMS HTTP client. Talks to Payload custom routes shipped in Sprint 2-CMS.
 *
 * The base URL comes from VITE_CMS_URL at build time. When unset, the mock
 * layer is used instead — `useCmsApi()` is the single decision point.
 */

const RAW_BASE = (import.meta.env.VITE_CMS_URL ?? '').trim()
export const CMS_BASE_URL = RAW_BASE.replace(/\/+$/, '') // strip trailing slash

export function useCmsApi(): boolean {
  return CMS_BASE_URL.length > 0
}

export class CmsError extends Error {
  constructor(public status: number, public body: unknown, message: string) {
    super(message)
    this.name = 'CmsError'
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${CMS_BASE_URL}${path}`
  const res = await fetch(url, init)
  if (!res.ok) {
    let body: unknown = null
    try {
      body = await res.json()
    } catch {
      // ignore parse failure
    }
    throw new CmsError(res.status, body, `CMS ${res.status}: ${path}`)
  }
  return (await res.json()) as T
}

// ---------- Search ----------

export interface SearchSignal {
  id: string
  assetSymbol: string
  assetName: string
  direction: 'BUY' | 'SELL' | 'HOLD'
  confidence: number
  reason: string
  generatedAt: string
  score: number
  matchedFields: string[]
}

export interface SearchResponse {
  query: string
  direction: string | null
  minConfidence: number
  results: SearchSignal[]
  count: number
}

export interface SearchOptions {
  q: string
  direction?: 'BUY' | 'SELL' | 'HOLD'
  minConfidence?: number
  limit?: number
}

export async function searchSignals(opts: SearchOptions): Promise<SearchResponse> {
  const params = new URLSearchParams({ q: opts.q })
  if (opts.direction) params.set('direction', opts.direction)
  if (opts.minConfidence !== undefined) params.set('minConfidence', String(opts.minConfidence))
  if (opts.limit !== undefined) params.set('limit', String(opts.limit))
  return request<SearchResponse>(`/api/search?${params.toString()}`)
}

// ---------- Risk Calculator ----------

export interface RiskAllocation {
  symbol: string
  pct: number
}

export interface RiskResponse {
  currency: string
  allocations: RiskAllocation[]
  hhi: number
  diversificationScore: number
  riskTier: 'low' | 'medium' | 'high'
  largestPosition: RiskAllocation
  assetCount: number
  breakdown: string
}

export function formatAllocations(allocations: RiskAllocation[]): string {
  return allocations.map((a) => `${a.symbol}:${a.pct}`).join(',')
}

export async function calculateRisk(
  allocations: RiskAllocation[],
  currency = 'USD',
): Promise<RiskResponse> {
  const params = new URLSearchParams({
    allocations: formatAllocations(allocations),
    currency,
  })
  return request<RiskResponse>(`/api/calculator/risk?${params.toString()}`)
}

// ---------- Asset Lookup ----------

export interface AssetExchange {
  name: string
}

export interface AssetSignalsSummary {
  total: number
  BUY: number
  SELL: number
  HOLD: number
}

export interface AssetDetail {
  id: string
  name: string
  symbol: string
  description?: string
  riskTier: 'low' | 'medium' | 'high'
  marketCapTier: 'large' | 'mid' | 'small'
  chain?: string
  exchanges?: AssetExchange[]
  isActive: boolean
  signalsSummary: AssetSignalsSummary
}

export async function getAssetBySymbol(symbol: string): Promise<AssetDetail> {
  return request<AssetDetail>(`/api/assets/${encodeURIComponent(symbol)}`)
}

export interface AssetSummary {
  id: string
  name: string
  symbol: string
  riskTier: 'low' | 'medium' | 'high'
  marketCapTier: 'large' | 'mid' | 'small'
}

export interface AssetCatalogueResponse {
  assets: AssetSummary[]
  count: number
}

export interface AssetCatalogueOptions {
  riskTier?: 'low' | 'medium' | 'high'
  marketCapTier?: 'large' | 'mid' | 'small'
  q?: string
}

export async function listAssets(
  opts: AssetCatalogueOptions = {},
): Promise<AssetCatalogueResponse> {
  const params = new URLSearchParams()
  if (opts.riskTier) params.set('riskTier', opts.riskTier)
  if (opts.marketCapTier) params.set('marketCapTier', opts.marketCapTier)
  if (opts.q) params.set('q', opts.q)
  const qs = params.toString()
  return request<AssetCatalogueResponse>(`/api/assets${qs ? `?${qs}` : ''}`)
}
