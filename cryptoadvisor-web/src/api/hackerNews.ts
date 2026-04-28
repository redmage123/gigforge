/**
 * HackerNews search via Algolia (Sprint 12, STORY-1205).
 *
 * Algolia hosts the public HN search API, fully open, no auth.
 * Endpoint: https://hn.algolia.com/api/v1/search?query=...&tags=story
 *
 * We use it as a retail-tech sentiment proxy: high crypto story volume +
 * high points = the technical crowd is engaged. Aggregated sentiment is
 * computed by running titles through `scoreText` from `utils/sentiment.ts`.
 */

export interface HnHit {
  objectID: string
  title: string
  url: string | null
  author: string
  points: number
  num_comments: number
  created_at: string
  created_at_i: number
}

export async function searchHn(query: string, hitsPerPage = 30): Promise<HnHit[]> {
  const params = new URLSearchParams({
    query,
    tags: 'story',
    hitsPerPage: String(hitsPerPage),
  })
  const res = await fetch(`https://hn.algolia.com/api/v1/search?${params.toString()}`)
  if (!res.ok) throw new Error(`hn ${res.status}`)
  const json = (await res.json()) as { hits: HnHit[] }
  return json.hits ?? []
}

/** Fetch HN crypto stories from the last 24h (Algolia's recency search). */
export async function recentCryptoStories(): Promise<HnHit[]> {
  const since = Math.floor(Date.now() / 1000) - 86400
  const params = new URLSearchParams({
    query: 'bitcoin OR ethereum OR crypto',
    tags: 'story',
    numericFilters: `created_at_i>${since}`,
    hitsPerPage: '50',
  })
  const res = await fetch(`https://hn.algolia.com/api/v1/search?${params.toString()}`)
  if (!res.ok) throw new Error(`hn recent ${res.status}`)
  const json = (await res.json()) as { hits: HnHit[] }
  return json.hits ?? []
}
