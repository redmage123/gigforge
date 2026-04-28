/**
 * Mempool.space public API client (Sprint 12, STORY-1207).
 *
 * Fully public Bitcoin chain explorer; no auth required.
 * Endpoints used:
 *   - /api/blocks/tip/height — current chain tip
 *   - /api/v1/fees/recommended — fee tiers (sat/vB)
 *   - /api/mempool — total mempool size + tx count + pending fees
 *   - /api/v1/mining/hashrate/3d — 3-day rolling hashrate
 */

const BASE = 'https://mempool.space/api'

export interface FeeTiers {
  fastestFee: number
  halfHourFee: number
  hourFee: number
  economyFee: number
  minimumFee: number
}

export interface MempoolStats {
  count: number
  vsize: number
  total_fee: number
}

export interface HashratePoint {
  timestamp: number
  avgHashrate: number
  difficulty: number
}

export async function getTipHeight(): Promise<number> {
  const res = await fetch(`${BASE}/blocks/tip/height`)
  if (!res.ok) throw new Error(`mempool tip ${res.status}`)
  return Number(await res.text())
}

export async function getRecommendedFees(): Promise<FeeTiers> {
  const res = await fetch(`${BASE}/v1/fees/recommended`)
  if (!res.ok) throw new Error(`mempool fees ${res.status}`)
  return (await res.json()) as FeeTiers
}

export async function getMempoolStats(): Promise<MempoolStats> {
  const res = await fetch(`${BASE}/mempool`)
  if (!res.ok) throw new Error(`mempool stats ${res.status}`)
  return (await res.json()) as MempoolStats
}

export async function getHashrate(): Promise<HashratePoint[]> {
  const res = await fetch(`${BASE}/v1/mining/hashrate/3d`)
  if (!res.ok) throw new Error(`mempool hashrate ${res.status}`)
  const json = (await res.json()) as { hashrates: HashratePoint[] }
  return json.hashrates ?? []
}
