/**
 * Conviction-ranked Signals page (Sprint 13, STORY-1302).
 *
 * Replaces the flat per-source signal list with a single composite feed:
 * for each tracked asset, fuse Donchian + RSI + MACD + sentiment +
 * on-chain into one ranked CompositeSignal. Each row expands to show
 * the contributing votes and an LLM-generated narrative explanation
 * (lazy-loaded via /signals/explain on the AI backend).
 *
 * Editorial CMS signals coexist as a separate section.
 */
import { useMemo, useState } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import { getPrices } from '../api/index'
import { useSignals } from '../hooks/useSignals'
import { generateDonchianSignals } from '../utils/signalGenerator'
import {
  rsi as computeRsi,
  macd as computeMacd,
} from '../utils/indicators'
import {
  computeComposite,
  toCompositeSignal,
  type CompositeRenderedSignal,
} from '../utils/composite'
import { explainSignal } from '../api/aiClient'
import Panel from '../components/ui/Panel'
import Badge from '../components/ui/Badge'
import LoadingSkeleton from '../components/ui/LoadingSkeleton'
import EmptyState from '../components/ui/EmptyState'
import SignalSearchBar from '../components/SignalSearchBar'
import AssetDetailModal from '../components/asset/AssetDetailModal'
import type { Asset, Signal } from '../types/index'
import { getFearGreed } from '../api/fearGreed'

const TRACKED: Asset[] = ['BTC', 'ETH', 'SOL', 'ADA']

function relativeTime(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export default function Signals() {
  const [activeAsset, setActiveAsset] = useState<string | null>(null)
  const editorial = useSignals()
  const [filter, setFilter] = useState<'ALL' | 'BUY' | 'SELL' | 'HOLD'>('ALL')

  const priceQueries = useQueries({
    queries: TRACKED.map((a) => ({
      queryKey: ['prices', a, '1M'],
      queryFn: () => getPrices(a, '1M'),
    })),
  })

  const fgQuery = useQuery({
    queryKey: ['fng-1'],
    queryFn: () => getFearGreed(1),
    staleTime: 300_000,
  })

  const fgPolarity = useMemo(() => {
    const v = fgQuery.data?.[0]?.value
    return typeof v === 'number' ? (v - 50) / 50 : 0
  }, [fgQuery.data])

  const composites: CompositeRenderedSignal[] = useMemo(() => {
    return TRACKED.map((asset, i) => {
      const candles = priceQueries[i].data?.candles ?? []
      if (candles.length < 30) return null
      // Donchian signal
      const donchianHits = generateDonchianSignals(candles, { symbol: asset, period: 20 })
      const lastDonchian = donchianHits[donchianHits.length - 1]
      const donchian = lastDonchian
        ? {
            action: lastDonchian.action,
            magnitude: Math.abs(lastDonchian.price - lastDonchian.level) / lastDonchian.level,
          }
        : undefined

      const closes = candles.map((c) => c.close)
      const rsiSeries = computeRsi(closes, 14)
      const lastRsi = rsiSeries[rsiSeries.length - 1]
      const macdResult = computeMacd(closes)
      const lastMacdH = macdResult.histogram[macdResult.histogram.length - 1]
      const lastMacdS = macdResult.signal[macdResult.signal.length - 1]

      const composite = computeComposite({
        symbol: asset,
        donchian,
        rsi: typeof lastRsi === 'number' ? lastRsi : null,
        macd: { histogram: lastMacdH, signal: lastMacdS },
        sentiment: fgPolarity,
      })
      return toCompositeSignal(composite)
    }).filter((x): x is CompositeRenderedSignal => x !== null)
  }, [priceQueries.map((q) => q.dataUpdatedAt).join(','), fgPolarity])

  const merged: Signal[] = useMemo(() => {
    const ed = (editorial.data ?? []).map((s) => ({ ...s, source: s.source ?? 'editorial' }))
    return [...composites, ...ed].sort((a, b) => b.confidence - a.confidence)
  }, [composites, editorial.data])

  const filtered = merged.filter((s) => filter === 'ALL' || s.direction === filter)

  return (
    <div className="space-y-4">
      <SignalSearchBar />
      <AssetDetailModal symbol={activeAsset} onClose={() => setActiveAsset(null)} />

      <Panel title="AI Trading Signals — conviction-ranked">
        <div className="flex gap-2 mb-4 flex-wrap" role="group" aria-label="Filter signals">
          {(['ALL', 'BUY', 'SELL', 'HOLD'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              aria-pressed={filter === f}
              className={`px-4 py-2 text-sm font-semibold rounded transition-colors focus:outline-none focus:ring-2 focus:ring-accent ${
                filter === f
                  ? 'bg-accent text-white'
                  : 'bg-bg-elevated text-text-secondary hover:bg-bg-border'
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        {editorial.isLoading && composites.length === 0 ? (
          <LoadingSkeleton rows={6} />
        ) : filtered.length === 0 ? (
          <EmptyState
            title="No signals"
            description="Composite signals appear here when watchlist assets have active inputs."
          />
        ) : (
          <div className="space-y-3">
            {filtered.map((s) => (
              <SignalRow key={s.id} signal={s} onOpen={setActiveAsset} />
            ))}
          </div>
        )}
      </Panel>
    </div>
  )
}

interface SignalRowProps {
  signal: Signal
  onOpen: (s: string) => void
}

function SignalRow({ signal, onOpen }: SignalRowProps) {
  const [expanded, setExpanded] = useState(false)
  const isComposite = signal.source === 'composite'
  const composite = signal as CompositeRenderedSignal

  const explainQuery = useQuery({
    queryKey: ['explain', signal.id],
    queryFn: () =>
      explainSignal({
        symbol: composite.asset,
        action: composite.direction,
        conviction: composite.confidence,
        contributors: composite.contributors,
        rawPolarity: composite.rawPolarity,
      }),
    enabled: expanded && isComposite,
    staleTime: Infinity,
  })

  return (
    <div className="bg-bg-elevated rounded-lg border border-bg-border">
      <div className="p-4">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onOpen(signal.asset)}
              className="font-mono font-bold text-base text-text-primary hover:text-accent focus:outline-none focus:ring-2 focus:ring-accent rounded px-1 -mx-1"
              aria-label={`Open details for ${signal.asset}`}
            >
              {signal.asset}
            </button>
            <Badge variant={signal.direction.toLowerCase() as 'buy' | 'sell' | 'hold'}>
              {signal.direction}
            </Badge>
            <span
              className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${
                isComposite
                  ? 'bg-accent/20 text-accent'
                  : 'bg-bg-base text-text-muted border border-bg-border'
              }`}
            >
              {isComposite ? 'Composite' : 'Editorial'}
            </span>
          </div>
          <span className="text-xs text-text-muted flex-shrink-0">
            {relativeTime(signal.timestamp)}
          </span>
        </div>

        <div className="mb-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-text-secondary">Conviction</span>
            <span className="text-xs font-mono tabular-nums font-semibold text-text-primary">
              {signal.confidence}%
            </span>
          </div>
          <div className="h-1.5 bg-bg-border rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${signal.confidence}%`,
                backgroundColor:
                  signal.confidence >= 75
                    ? 'var(--color-positive)'
                    : signal.confidence >= 50
                    ? 'var(--color-neutral)'
                    : 'var(--color-negative)',
              }}
              role="progressbar"
              aria-valuenow={signal.confidence}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
        </div>

        <p className="text-sm text-text-secondary">{signal.reason}</p>

        {isComposite && (
          <button
            type="button"
            onClick={() => setExpanded((x) => !x)}
            className="mt-2 text-xs text-accent hover:underline focus:outline-none focus:ring-2 focus:ring-accent rounded"
            aria-expanded={expanded}
          >
            {expanded ? '▾ Hide explanation' : '▸ Why this signal?'}
          </button>
        )}
      </div>

      {expanded && isComposite && (
        <div className="border-t border-bg-border p-4 space-y-3 bg-bg-base">
          <div>
            <div className="text-xs font-semibold text-text-secondary uppercase mb-2">
              Contributing signals
            </div>
            <ul className="space-y-1 text-xs">
              {composite.contributors.map((c, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span
                    className={`font-mono tabular-nums ${
                      c.vote > 0 ? 'text-emerald-400' : c.vote < 0 ? 'text-rose-400' : 'text-text-muted'
                    }`}
                  >
                    {c.vote > 0 ? '+' : ''}
                    {c.vote.toFixed(2)}
                  </span>
                  <span className="text-text-muted">×{c.weight.toFixed(2)}</span>
                  <span className="text-text-secondary flex-1">
                    <strong className="text-text-primary">{c.source}</strong> — {c.detail}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <div className="text-xs font-semibold text-text-secondary uppercase mb-2">
              AI narrative
            </div>
            {explainQuery.isLoading ? (
              <p className="text-xs text-text-muted italic">Generating explanation…</p>
            ) : explainQuery.isError ? (
              <p className="text-xs text-rose-400">
                Explanation unavailable (AI service offline).
              </p>
            ) : explainQuery.data ? (
              <>
                <p className="text-sm text-text-primary whitespace-pre-wrap">
                  {explainQuery.data.explanation}
                </p>
                {explainQuery.data.rag_sources.length > 0 && (
                  <div className="mt-2 text-[10px] text-text-muted">
                    Sources:{' '}
                    {explainQuery.data.rag_sources
                      .map((s) => s.title)
                      .join(' • ')}
                  </div>
                )}
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}
