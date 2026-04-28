/**
 * Sentiment dashboard (Sprint 12, STORY-1206).
 *
 * Aggregates four free sentiment sources:
 *   - Crypto Fear & Greed Index (alternative.me)
 *   - Reddit hot posts across r/CryptoCurrency / r/Bitcoin / r/ethereum
 *   - GDELT global news tone for "bitcoin OR ethereum"
 *   - HackerNews crypto stories from the last 24h
 *
 * Reddit and HN titles are scored with the built-in VADER-lite classifier;
 * GDELT supplies its own pre-computed tone; F&G is a single 0-100 index.
 * A composite polarity is the weighted average of all four sources.
 */
import { useMemo } from 'react'
import { useQueries } from '@tanstack/react-query'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { getFearGreed } from '../api/fearGreed'
import { getCryptoHotPosts } from '../api/reddit'
import { getToneTimeline } from '../api/gdelt'
import { recentCryptoStories } from '../api/hackerNews'
import { aggregateSentiment, scoreText } from '../utils/sentiment'
import Panel from '../components/ui/Panel'
import StatCard from '../components/ui/StatCard'
import LoadingSkeleton from '../components/ui/LoadingSkeleton'
import { CHART_COLORS } from '../types/index'

function pct(n: number, digits = 1): string {
  return Number.isFinite(n) ? `${(n * 100).toFixed(digits)}%` : '—'
}

export default function Sentiment() {
  const [fgQ, redditQ, gdeltQ, hnQ] = useQueries({
    queries: [
      { queryKey: ['fng'], queryFn: () => getFearGreed(30), staleTime: 60_000 },
      { queryKey: ['reddit-crypto'], queryFn: () => getCryptoHotPosts(20), staleTime: 60_000 },
      {
        queryKey: ['gdelt-tone'],
        queryFn: () => getToneTimeline('bitcoin OR ethereum', '24h'),
        staleTime: 60_000,
      },
      {
        queryKey: ['hn-crypto'],
        queryFn: () => recentCryptoStories(),
        staleTime: 60_000,
      },
    ],
  })

  const fgLatest = fgQ.data?.[0]
  const fgHistory = useMemo(
    () =>
      fgQ.data
        ?.slice()
        .reverse()
        .map((d) => ({
          date: new Date(d.timestamp).toLocaleDateString(),
          value: d.value,
        })) ?? [],
    [fgQ.data],
  )

  const redditAgg = useMemo(() => {
    const posts = redditQ.data ?? []
    return aggregateSentiment(
      posts.map((p) => ({ text: `${p.title} ${p.selftext}`.slice(0, 500), weight: p.ups })),
    )
  }, [redditQ.data])

  const gdeltAvgTone = useMemo(() => {
    const points = gdeltQ.data ?? []
    if (points.length === 0) return 0
    return points.reduce((s, p) => s + p.tone, 0) / points.length
  }, [gdeltQ.data])

  const hnAgg = useMemo(() => {
    const hits = hnQ.data ?? []
    return aggregateSentiment(
      hits.map((h) => ({ text: h.title, weight: h.points + h.num_comments })),
    )
  }, [hnQ.data])

  // Composite: F&G normalized to [-1,+1], Reddit polarity, GDELT/100, HN polarity
  const composite = useMemo(() => {
    const parts: Array<{ value: number; weight: number }> = []
    if (fgLatest) parts.push({ value: (fgLatest.value - 50) / 50, weight: 1 })
    if (redditQ.data) parts.push({ value: redditAgg.polarity, weight: 1.5 })
    if (gdeltQ.data) parts.push({ value: gdeltAvgTone / 100, weight: 1 })
    if (hnQ.data) parts.push({ value: hnAgg.polarity, weight: 0.5 })
    if (parts.length === 0) return 0
    const totalW = parts.reduce((s, p) => s + p.weight, 0)
    return parts.reduce((s, p) => s + p.value * p.weight, 0) / totalW
  }, [fgLatest, redditQ.data, gdeltQ.data, hnQ.data, redditAgg, gdeltAvgTone, hnAgg])

  const isLoading = fgQ.isLoading && redditQ.isLoading && gdeltQ.isLoading && hnQ.isLoading
  if (isLoading) return <LoadingSkeleton rows={8} />

  return (
    <div className="space-y-4">
      <Panel title="Composite Sentiment">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            label="Composite"
            value={pct(composite)}
            change={
              composite > 0.15 ? 'bullish' : composite < -0.15 ? 'bearish' : 'neutral'
            }
            changeType={composite > 0 ? 'positive' : composite < 0 ? 'negative' : 'neutral'}
          />
          <StatCard
            label="Fear & Greed"
            value={fgLatest ? `${fgLatest.value}` : '—'}
            change={fgLatest?.classification ?? ''}
            changeType={
              fgLatest && fgLatest.value > 60 ? 'positive' : fgLatest && fgLatest.value < 40 ? 'negative' : 'neutral'
            }
          />
          <StatCard
            label="GDELT 24h Tone"
            value={Number.isFinite(gdeltAvgTone) ? gdeltAvgTone.toFixed(2) : '—'}
            change={gdeltAvgTone > 0 ? 'positive press' : gdeltAvgTone < 0 ? 'negative press' : 'neutral'}
            changeType={gdeltAvgTone > 0 ? 'positive' : gdeltAvgTone < 0 ? 'negative' : 'neutral'}
          />
          <StatCard
            label="Reddit Polarity"
            value={pct(redditAgg.polarity)}
            change={`${redditAgg.positive}↑ / ${redditAgg.negative}↓`}
            changeType={redditAgg.polarity > 0 ? 'positive' : 'negative'}
          />
        </div>
      </Panel>

      <Panel title="Fear & Greed — 30-day history">
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={fgHistory} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
              <XAxis dataKey="date" tick={{ fill: CHART_COLORS.text, fontSize: 10 }} />
              <YAxis
                domain={[0, 100]}
                ticks={[0, 25, 50, 75, 100]}
                tick={{ fill: CHART_COLORS.text, fontSize: 10 }}
                width={36}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: CHART_COLORS.elevated,
                  border: `1px solid ${CHART_COLORS.grid}`,
                  fontSize: 11,
                }}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke={CHART_COLORS.accent}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="Reddit — top crypto posts (24h)">
          {redditQ.data && redditQ.data.length > 0 ? (
            <ul className="space-y-2 text-sm">
              {redditQ.data.slice(0, 8).map((p) => {
                const s = scoreText(p.title)
                return (
                  <li key={p.id} className="border-b border-bg-border pb-2 last:border-0">
                    <a
                      href={p.permalink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-text-primary hover:text-accent hover:underline"
                    >
                      {p.title}
                    </a>
                    <div className="flex items-center gap-3 mt-1 text-xs text-text-muted">
                      <span>r/{p.subreddit}</span>
                      <span>↑ {p.ups}</span>
                      <span>{p.num_comments} comments</span>
                      <span
                        className={
                          s.label === 'positive'
                            ? 'text-emerald-400'
                            : s.label === 'negative'
                            ? 'text-rose-400'
                            : 'text-text-muted'
                        }
                      >
                        {s.label} ({s.polarity.toFixed(2)})
                      </span>
                    </div>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="text-text-muted">{redditQ.isError ? 'Reddit fetch failed.' : 'Loading…'}</p>
          )}
        </Panel>

        <Panel title="HackerNews — crypto stories (24h)">
          {hnQ.data && hnQ.data.length > 0 ? (
            <ul className="space-y-2 text-sm">
              {hnQ.data.slice(0, 8).map((h) => {
                const s = scoreText(h.title)
                return (
                  <li key={h.objectID} className="border-b border-bg-border pb-2 last:border-0">
                    <a
                      href={h.url ?? `https://news.ycombinator.com/item?id=${h.objectID}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-text-primary hover:text-accent hover:underline"
                    >
                      {h.title}
                    </a>
                    <div className="flex items-center gap-3 mt-1 text-xs text-text-muted">
                      <span>by {h.author}</span>
                      <span>{h.points} pts</span>
                      <span>{h.num_comments} comments</span>
                      <span
                        className={
                          s.label === 'positive'
                            ? 'text-emerald-400'
                            : s.label === 'negative'
                            ? 'text-rose-400'
                            : 'text-text-muted'
                        }
                      >
                        {s.label}
                      </span>
                    </div>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="text-text-muted">{hnQ.isError ? 'HN fetch failed.' : 'Loading…'}</p>
          )}
        </Panel>
      </div>
    </div>
  )
}
