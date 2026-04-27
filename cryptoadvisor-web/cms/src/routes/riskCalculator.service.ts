export interface Allocation {
  symbol: string
  pct: number
}

export type RiskTier = 'low' | 'medium' | 'high'

export interface RiskResult {
  allocations: Allocation[]
  hhi: number
  diversificationScore: number
  riskTier: RiskTier
  largestPosition: Allocation
  assetCount: number
  breakdown: string
}

export interface ParseError {
  message: string
}

export interface ParseResult {
  ok: true
  allocations: Allocation[]
}

export interface ParseFailure {
  ok: false
  error: ParseError
}

const SUM_TOLERANCE = 0.5
const MAX_ASSETS = 20

export function parseAllocations(raw: string): ParseResult | ParseFailure {
  const pairs = raw.split(',').map((p) => p.trim()).filter((p) => p.length > 0)

  if (pairs.length === 0) {
    return { ok: false, error: { message: 'allocations is required' } }
  }

  if (pairs.length > MAX_ASSETS) {
    return { ok: false, error: { message: 'Maximum 20 assets allowed' } }
  }

  const seen = new Set<string>()
  const allocations: Allocation[] = []

  for (const pair of pairs) {
    if (!pair.includes(':')) {
      return { ok: false, error: { message: `Invalid allocation format: ${pair}` } }
    }

    const [symbolRaw, pctRaw] = pair.split(':', 2)
    const symbol = symbolRaw.trim().toUpperCase()
    const pctStr = (pctRaw ?? '').trim()

    if (!symbol) {
      return { ok: false, error: { message: `Invalid allocation format: ${pair}` } }
    }

    const pct = Number(pctStr)
    if (!Number.isFinite(pct)) {
      return { ok: false, error: { message: `Invalid allocation percentage: ${pctStr}` } }
    }

    if (pct < 0) {
      return { ok: false, error: { message: 'Allocation percentages must be non-negative' } }
    }

    if (seen.has(symbol)) {
      return { ok: false, error: { message: `Duplicate symbol: ${symbol}` } }
    }

    seen.add(symbol)
    allocations.push({ symbol, pct })
  }

  const sum = allocations.reduce((acc, a) => acc + a.pct, 0)
  if (Math.abs(sum - 100) > SUM_TOLERANCE) {
    return {
      ok: false,
      error: { message: `Allocations must sum to 100 (got ${sum.toFixed(1)})` },
    }
  }

  return { ok: true, allocations }
}

export function computeRisk(allocations: Allocation[]): RiskResult {
  const hhiRaw = allocations.reduce((acc, a) => acc + (a.pct / 100) ** 2, 0)
  // Round HHI to 4 decimal places for stable response output.
  const hhi = Math.round(hhiRaw * 10000) / 10000
  const diversificationScore = Math.round((1 - hhi) * 1000) / 10

  let riskTier: RiskTier
  if (hhi >= 0.5) riskTier = 'high'
  else if (hhi >= 0.25) riskTier = 'medium'
  else riskTier = 'low'

  const largestPosition = allocations.reduce((a, b) => (b.pct > a.pct ? b : a))

  let concentrationLabel: string
  if (hhi >= 0.5) concentrationLabel = 'high concentration'
  else if (hhi >= 0.25) concentrationLabel = 'moderate concentration'
  else concentrationLabel = 'low concentration'

  const breakdown =
    `HHI of ${hhi.toFixed(4)} indicates ${concentrationLabel}. ` +
    `${largestPosition.symbol} represents ${largestPosition.pct}% of the portfolio.`

  return {
    allocations,
    hhi,
    diversificationScore,
    riskTier,
    largestPosition,
    assetCount: allocations.length,
    breakdown,
  }
}
