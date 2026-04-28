/**
 * Crypto Fear & Greed Index — Alternative.me free API (Sprint 12, STORY-1202).
 *
 * Endpoint: https://api.alternative.me/fng/?limit=N
 * No auth, no rate limit (sane usage). Returns daily scores 0-100 and a
 * human label (Extreme Fear / Fear / Neutral / Greed / Extreme Greed).
 */

export interface FearGreedReading {
  value: number
  classification: string
  timestamp: number
}

interface RawResponse {
  data: Array<{
    value: string
    value_classification: string
    timestamp: string
  }>
}

const ENDPOINT = 'https://api.alternative.me/fng/'

export async function getFearGreed(limit = 30): Promise<FearGreedReading[]> {
  const res = await fetch(`${ENDPOINT}?limit=${limit}`)
  if (!res.ok) throw new Error(`fearGreed ${res.status}`)
  const json = (await res.json()) as RawResponse
  return json.data.map((d) => ({
    value: Number(d.value),
    classification: d.value_classification,
    timestamp: Number(d.timestamp) * 1000,
  }))
}
