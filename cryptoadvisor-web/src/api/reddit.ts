/**
 * Reddit hot-post fetcher (Sprint 12, STORY-1203).
 *
 * Public JSON endpoint: https://www.reddit.com/r/<sub>/hot.json?limit=N
 * No auth required for read-only. Reddit rate-limits aggressively without
 * a User-Agent — we set one explicitly. Browser CORS is permissive on the
 * `.json` paths (verified empirically; Reddit serves with `Access-Control-
 * Allow-Origin: *` since 2018).
 */

export interface RedditPost {
  id: string
  subreddit: string
  title: string
  selftext: string
  ups: number
  downs: number
  num_comments: number
  created: number
  permalink: string
  author: string
}

interface RawListing {
  data: {
    children: Array<{
      data: {
        id: string
        subreddit: string
        title: string
        selftext: string
        ups: number
        downs: number
        num_comments: number
        created_utc: number
        permalink: string
        author: string
      }
    }>
  }
}

export const CRYPTO_SUBREDDITS = [
  'CryptoCurrency',
  'Bitcoin',
  'ethereum',
  'CryptoMarkets',
] as const

export type CryptoSub = (typeof CRYPTO_SUBREDDITS)[number]

export async function getHotPosts(sub: CryptoSub, limit = 25): Promise<RedditPost[]> {
  const url = `https://www.reddit.com/r/${sub}/hot.json?limit=${limit}`
  const res = await fetch(url, {
    headers: { 'User-Agent': 'cryptoadvisor/1.0 (browser)' },
  })
  if (!res.ok) throw new Error(`reddit ${sub} ${res.status}`)
  const json = (await res.json()) as RawListing
  return json.data.children.map((c) => ({
    id: c.data.id,
    subreddit: c.data.subreddit,
    title: c.data.title,
    selftext: c.data.selftext,
    ups: c.data.ups,
    downs: c.data.downs,
    num_comments: c.data.num_comments,
    created: c.data.created_utc * 1000,
    permalink: `https://www.reddit.com${c.data.permalink}`,
    author: c.data.author,
  }))
}

/** Fetch all subreddits in parallel and merge results. */
export async function getCryptoHotPosts(limit = 25): Promise<RedditPost[]> {
  const results = await Promise.allSettled(CRYPTO_SUBREDDITS.map((s) => getHotPosts(s, limit)))
  const out: RedditPost[] = []
  for (const r of results) if (r.status === 'fulfilled') out.push(...r.value)
  return out.sort((a, b) => b.ups - a.ups)
}
