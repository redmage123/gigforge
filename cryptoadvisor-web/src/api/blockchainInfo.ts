/**
 * Blockchain.com Charts API (Sprint 12, STORY-1208).
 *
 * Long-running historical BTC metrics, fully public, no auth.
 * Endpoint: https://api.blockchain.info/charts/<metric>?timespan=...&format=json
 *
 * Common metrics: hash-rate, n-transactions, miners-revenue, market-cap,
 * mempool-size, transaction-fees-usd, total-bitcoins.
 */

const BASE = 'https://api.blockchain.info/charts'

export type BlockchainMetric =
  | 'hash-rate'
  | 'n-transactions'
  | 'miners-revenue'
  | 'market-cap'
  | 'mempool-size'
  | 'transaction-fees-usd'
  | 'total-bitcoins'

export interface ChartPoint {
  x: number // unix seconds
  y: number
}

export async function getChart(
  metric: BlockchainMetric,
  timespan = '90days',
): Promise<ChartPoint[]> {
  const params = new URLSearchParams({
    timespan,
    format: 'json',
    cors: 'true',
  })
  const res = await fetch(`${BASE}/${metric}?${params.toString()}`)
  if (!res.ok) throw new Error(`blockchain.info ${metric} ${res.status}`)
  const json = (await res.json()) as { values: ChartPoint[] }
  return json.values ?? []
}
