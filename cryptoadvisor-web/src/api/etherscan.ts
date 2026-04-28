/**
 * Etherscan free-tier client (Sprint 12, STORY-1209).
 *
 * Etherscan's free tier requires registration but the API key is free.
 * Rate limit: 5 req/sec, 100k calls/day. We use a single shared key
 * provided via VITE_ETHERSCAN_API_KEY at build time; if absent we still
 * call the API (Etherscan accepts up to ~5 req/sec without a key for
 * read-only reads, though it logs warnings).
 *
 * Endpoint: https://api.etherscan.io/api?module=...&action=...
 */

const BASE = 'https://api.etherscan.io/api'

const KEY =
  typeof import.meta !== 'undefined' && import.meta.env
    ? (import.meta.env.VITE_ETHERSCAN_API_KEY as string | undefined) ?? ''
    : ''

interface EtherscanResponse<T> {
  status: string
  message: string
  result: T
}

async function call<T>(params: Record<string, string>): Promise<T> {
  const qs = new URLSearchParams({ ...params, apikey: KEY }).toString()
  const res = await fetch(`${BASE}?${qs}`)
  if (!res.ok) throw new Error(`etherscan ${res.status}`)
  const json = (await res.json()) as EtherscanResponse<T>
  if (json.status === '0' && json.message !== 'No transactions found') {
    throw new Error(`etherscan: ${json.message}`)
  }
  return json.result
}

export interface GasOracle {
  SafeGasPrice: string
  ProposeGasPrice: string
  FastGasPrice: string
  suggestBaseFee: string
}

export async function getGasOracle(): Promise<GasOracle> {
  return call<GasOracle>({ module: 'gastracker', action: 'gasoracle' })
}

/** Total ETH supply in wei. Divide by 1e18 for ETH units. */
export async function getEthSupply(): Promise<string> {
  return call<string>({ module: 'stats', action: 'ethsupply' })
}

export interface EthPrice {
  ethbtc: string
  ethbtc_timestamp: string
  ethusd: string
  ethusd_timestamp: string
}

export async function getEthPrice(): Promise<EthPrice> {
  return call<EthPrice>({ module: 'stats', action: 'ethprice' })
}
