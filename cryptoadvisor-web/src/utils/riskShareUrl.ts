/**
 * Encode/decode portfolio allocations to/from a URL query string so
 * Risk Calculator runs are bookmarkable + shareable.
 *
 * Format: ?allocations=BTC:50,ETH:30,USD:20
 *
 * Mirrors the same wire format the CMS endpoint accepts, so the URL is also
 * directly testable via curl against the API.
 */

import type { RiskAllocation } from '../api/cms/client'

const PARAM = 'allocations'

export function encodeAllocations(allocations: RiskAllocation[]): string {
  return allocations
    .filter((a) => a.symbol.trim().length > 0)
    .map((a) => `${a.symbol.toUpperCase()}:${a.pct}`)
    .join(',')
}

export function decodeAllocations(raw: string | null): RiskAllocation[] | null {
  if (!raw) return null
  const out: RiskAllocation[] = []
  for (const pair of raw.split(',')) {
    const [sym, pctRaw] = pair.split(':', 2)
    if (!sym) continue
    const pct = Number(pctRaw)
    if (!Number.isFinite(pct)) return null
    out.push({ symbol: sym.trim().toUpperCase(), pct })
  }
  return out.length > 0 ? out : null
}

export function readAllocationsFromLocation(
  search: string = window.location.search,
): RiskAllocation[] | null {
  const params = new URLSearchParams(search)
  return decodeAllocations(params.get(PARAM))
}

/**
 * Push the encoded allocations into the URL without a full navigation,
 * so the user can copy the address bar to share.
 */
export function pushAllocationsToUrl(allocations: RiskAllocation[]): void {
  const encoded = encodeAllocations(allocations)
  const params = new URLSearchParams(window.location.search)
  if (encoded) {
    params.set(PARAM, encoded)
  } else {
    params.delete(PARAM)
  }
  const next = `${window.location.pathname}?${params.toString()}`
  window.history.replaceState(null, '', next)
}
