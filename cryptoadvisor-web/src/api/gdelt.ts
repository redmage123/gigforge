/**
 * GDELT v2 doc-search client (Sprint 12, STORY-1204).
 *
 * GDELT — Global Database of Events, Language, and Tone — indexes news
 * articles globally and computes a per-article tone score in [-100, +100].
 * The doc API is fully open, no auth.
 *
 * Endpoint: https://api.gdeltproject.org/api/v2/doc/doc?query=...&mode=ArtList&format=json
 * Filters use a small DSL: keyword search, language=eng, sourcecountry=US, etc.
 *
 * Honest scope notes:
 *   - GDELT's tone is computed from article text via a fixed lexicon, not
 *     LLMs. It correlates with sentiment but is biased toward formal news
 *     prose (less sensitive to social-media tone).
 *   - The doc API doesn't return tone directly per article; it's part of
 *     the "TimelineTone" mode. We use TimelineTone for the rolling chart
 *     and ArtList for the headline grid.
 */

export interface GdeltArticle {
  url: string
  title: string
  domain: string
  language: string
  sourcecountry: string
  seendate: string
  socialimage?: string
}

export interface GdeltTonePoint {
  date: string
  /** Raw tone score in [-100, +100]. */
  tone: number
  /** Article-volume normalization factor. */
  volume: number
}

const BASE = 'https://api.gdeltproject.org/api/v2/doc/doc'

export async function searchArticles(
  query: string,
  maxRecords = 25,
): Promise<GdeltArticle[]> {
  const params = new URLSearchParams({
    query,
    mode: 'ArtList',
    format: 'json',
    maxrecords: String(maxRecords),
    sort: 'datedesc',
  })
  const res = await fetch(`${BASE}?${params.toString()}`)
  if (!res.ok) throw new Error(`gdelt ${res.status}`)
  const json = (await res.json()) as { articles?: GdeltArticle[] }
  return json.articles ?? []
}

export async function getToneTimeline(
  query: string,
  timespan = '24h',
): Promise<GdeltTonePoint[]> {
  const params = new URLSearchParams({
    query,
    mode: 'TimelineTone',
    format: 'json',
    timespan,
  })
  const res = await fetch(`${BASE}?${params.toString()}`)
  if (!res.ok) throw new Error(`gdelt timeline ${res.status}`)
  const json = (await res.json()) as {
    timeline?: Array<{ data: Array<{ date: string; value: number }> }>
  }
  const series = json.timeline?.[0]?.data ?? []
  return series.map((d) => ({ date: d.date, tone: d.value, volume: 0 }))
}

export const CRYPTO_QUERIES = {
  bitcoin: 'bitcoin OR BTC',
  ethereum: 'ethereum OR ETH',
  crypto: 'cryptocurrency OR crypto',
} as const
