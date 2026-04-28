/**
 * DefiLlama public API (Sprint 12, STORY-1210).
 *
 * Fully public, no auth. The single best free source of DeFi TVL data
 * across every chain and every major protocol.
 *
 * Endpoints used:
 *   - /protocols       — full protocol list with TVL
 *   - /chains          — TVL per chain
 *   - /tvl/<protocol>  — current TVL for a single protocol
 */

const BASE = 'https://api.llama.fi'

export interface DefiProtocol {
  id: string
  name: string
  symbol: string
  chain: string
  category: string
  tvl: number
  change_1d: number
  change_7d: number
}

export interface DefiChain {
  gecko_id: string | null
  name: string
  tokenSymbol: string | null
  tvl: number
}

export async function getProtocols(): Promise<DefiProtocol[]> {
  const res = await fetch(`${BASE}/protocols`)
  if (!res.ok) throw new Error(`defillama protocols ${res.status}`)
  return (await res.json()) as DefiProtocol[]
}

export async function getChains(): Promise<DefiChain[]> {
  const res = await fetch(`${BASE}/chains`)
  if (!res.ok) throw new Error(`defillama chains ${res.status}`)
  return (await res.json()) as DefiChain[]
}

export async function getProtocolTVL(slug: string): Promise<number> {
  const res = await fetch(`${BASE}/tvl/${encodeURIComponent(slug)}`)
  if (!res.ok) throw new Error(`defillama tvl ${slug} ${res.status}`)
  return Number(await res.text())
}
