/**
 * Stats page (Sprint 10, STORY-1006).
 *
 * Presents the full statistical-analytics surface for a selected asset:
 *   - Risk-adjusted StatCards (Sharpe, Sortino, Max Drawdown, Hurst)
 *   - Distribution moments (skewness, excess kurtosis)
 *   - Returns histogram
 *   - Drawdown chart
 *   - Cross-asset correlation heatmap on the Dashboard's tracked symbols
 */
import { useMemo, useState } from 'react'
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useQueries } from '@tanstack/react-query'
import { getPrices } from '../api/index'
import {
  correlationMatrix,
  distributionMoments,
  hurstExponent,
  logReturns,
  riskAdjustedMetrics,
} from '../utils/statistics'
import Panel from '../components/ui/Panel'
import StatCard from '../components/ui/StatCard'
import LoadingSkeleton from '../components/ui/LoadingSkeleton'
import ErrorBanner from '../components/ui/ErrorBanner'
import { CHART_COLORS } from '../types/index'
import PortfolioOptimizer from '../components/stats/PortfolioOptimizer'
import type { Asset } from '../types/index'

const ASSETS: Asset[] = ['BTC', 'ETH', 'SOL', 'ADA']
const HISTOGRAM_BUCKETS = 20

function pct(n: number, digits = 2): string {
  return `${(n * 100).toFixed(digits)}%`
}

function fmt(n: number, digits = 2): string {
  return Number.isFinite(n) ? n.toFixed(digits) : '—'
}

export default function Stats() {
  const [asset, setAsset] = useState<Asset>('BTC')

  const queries = useQueries({
    queries: ASSETS.map((a) => ({
      queryKey: ['prices', a, '1M'],
      queryFn: () => getPrices(a, '1M'),
    })),
  })

  const isLoading = queries.some((q) => q.isLoading)
  const isError = queries.some((q) => q.isError)
  const allCandlesByAsset = useMemo(() => {
    const out: Record<string, number[]> = {}
    for (let i = 0; i < ASSETS.length; i++) {
      const c = queries[i].data?.candles
      if (c) out[ASSETS[i]] = c.map((x) => x.close)
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queries.map((q) => q.dataUpdatedAt).join(',')])

  const closes = allCandlesByAsset[asset] ?? []

  const metrics = useMemo(() => riskAdjustedMetrics(closes), [closes])
  const moments = useMemo(() => distributionMoments(closes), [closes])
  const hurst = useMemo(() => hurstExponent(closes), [closes])

  const histogramData = useMemo(() => {
    const returns = logReturns(closes)
    if (returns.length === 0) return []
    const min = Math.min(...returns)
    const max = Math.max(...returns)
    if (max === min) return []
    const step = (max - min) / HISTOGRAM_BUCKETS
    const buckets = new Array(HISTOGRAM_BUCKETS).fill(0)
    for (const r of returns) {
      const idx = Math.min(HISTOGRAM_BUCKETS - 1, Math.floor((r - min) / step))
      buckets[idx]++
    }
    return buckets.map((count, i) => ({
      bucket: `${pct(min + i * step, 1)}`,
      count,
      midpoint: min + (i + 0.5) * step,
    }))
  }, [closes])

  const drawdownData = useMemo(() => {
    if (closes.length === 0) return []
    let peak = closes[0]
    return closes.map((c, i) => {
      if (c > peak) peak = c
      const dd = peak === 0 ? 0 : (peak - c) / peak
      return { i, drawdown: -dd * 100 }
    })
  }, [closes])

  const corr = useMemo(() => correlationMatrix(allCandlesByAsset), [allCandlesByAsset])

  if (isLoading) return <LoadingSkeleton rows={8} />
  if (isError) return <ErrorBanner />

  return (
    <div className="space-y-4">
      <Panel title="Statistical Analytics">
        <div className="flex items-center gap-3 mb-4">
          <label htmlFor="stats-asset" className="text-sm text-text-secondary">
            Asset
          </label>
          <select
            id="stats-asset"
            value={asset}
            onChange={(e) => setAsset(e.target.value as Asset)}
            className="bg-bg-elevated border border-bg-border rounded px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
          >
            {ASSETS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>

        {/* Top row — risk-adjusted StatCards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
          <StatCard label="Sharpe (annual)" value={fmt(metrics.sharpe)} />
          <StatCard label="Sortino (annual)" value={fmt(metrics.sortino)} />
          <StatCard label="Max Drawdown" value={pct(metrics.maxDrawdown)} />
          <StatCard
            label="Hurst Exponent"
            value={fmt(hurst.exponent)}
            change={
              hurst.exponent > 0.5
                ? 'trending'
                : hurst.exponent < 0.5
                ? 'mean-reverting'
                : 'random walk'
            }
            changeType={hurst.exponent > 0.5 ? 'positive' : 'neutral'}
          />
        </div>

        {/* Second row — moments side panel + histogram */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-text-primary">Returns Distribution</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <KV label="Mean" value={pct(moments.mean, 3)} />
              <KV label="Stdev" value={pct(moments.stdev, 3)} />
              <KV label="Skewness" value={fmt(moments.skewness, 3)} />
              <KV label="Excess Kurt." value={fmt(moments.excessKurtosis, 3)} />
              <KV label="Observations" value={String(moments.count)} />
            </div>
            {hurst.warning ? (
              <p className="text-xs text-amber-400 mt-2" role="note">
                ⚠ {hurst.warning}
              </p>
            ) : null}
          </div>
          <div className="lg:col-span-2 h-64">
            <h3 className="text-sm font-semibold text-text-primary mb-2">Returns Histogram</h3>
            <ResponsiveContainer width="100%" height="90%">
              <BarChart data={histogramData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
                <XAxis
                  dataKey="bucket"
                  tick={{ fill: CHART_COLORS.text, fontSize: 10 }}
                  interval={Math.floor(HISTOGRAM_BUCKETS / 6)}
                />
                <YAxis tick={{ fill: CHART_COLORS.text, fontSize: 10 }} width={28} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: CHART_COLORS.elevated,
                    border: `1px solid ${CHART_COLORS.grid}`,
                    fontSize: 11,
                  }}
                />
                <Bar dataKey="count" fill={CHART_COLORS.accent} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </Panel>

      <Panel title="Drawdown">
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={drawdownData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
              <XAxis dataKey="i" tick={{ fill: CHART_COLORS.text, fontSize: 10 }} />
              <YAxis
                tick={{ fill: CHART_COLORS.text, fontSize: 10 }}
                tickFormatter={(v: number) => `${v.toFixed(0)}%`}
                width={36}
              />
              <Tooltip
                formatter={(value: unknown) =>
                  typeof value === 'number' ? `${value.toFixed(2)}%` : '-'
                }
                contentStyle={{
                  backgroundColor: CHART_COLORS.elevated,
                  border: `1px solid ${CHART_COLORS.grid}`,
                  fontSize: 11,
                }}
              />
              <Area
                type="monotone"
                dataKey="drawdown"
                stroke={CHART_COLORS.negative}
                fill={CHART_COLORS.negative}
                fillOpacity={0.3}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <Panel title="Correlation Matrix">
        <CorrelationHeatmap symbols={corr.symbols} matrix={corr.matrix} />
      </Panel>

      <Panel title="Portfolio Optimization (Modern Portfolio Theory)">
        <PortfolioOptimizer series={allCandlesByAsset} />
      </Panel>
    </div>
  )
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-bg-elevated rounded px-3 py-2">
      <div className="text-xs text-text-muted uppercase tracking-wide">{label}</div>
      <div className="text-text-primary font-mono tabular-nums">{value}</div>
    </div>
  )
}

interface CorrelationHeatmapProps {
  symbols: string[]
  matrix: number[][]
}

function CorrelationHeatmap({ symbols, matrix }: CorrelationHeatmapProps) {
  if (symbols.length === 0) return <p className="text-text-muted">No data.</p>
  return (
    <div className="overflow-x-auto">
      <table className="text-xs">
        <thead>
          <tr>
            <th></th>
            {symbols.map((s) => (
              <th key={s} className="px-2 py-1 text-text-secondary">
                {s}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {symbols.map((rowSym, i) => (
            <tr key={rowSym}>
              <th className="text-text-secondary pr-2 text-right">{rowSym}</th>
              {symbols.map((colSym, j) => {
                const v = matrix[i][j]
                return (
                  <td
                    key={colSym}
                    className="px-2 py-1 text-center font-mono tabular-nums"
                    style={{
                      backgroundColor: heatColor(v),
                      color: Math.abs(v) > 0.5 ? '#fff' : '#000',
                      minWidth: 56,
                    }}
                    aria-label={`${rowSym} vs ${colSym}: ${v.toFixed(2)}`}
                  >
                    {v.toFixed(2)}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function heatColor(v: number): string {
  // -1 (red) → 0 (white) → +1 (green)
  if (v >= 0) {
    const intensity = Math.min(1, v)
    const g = 200 - Math.round(intensity * 100)
    return `rgb(${255 - intensity * 200}, ${g + 50}, ${255 - intensity * 200})`
  }
  const intensity = Math.min(1, -v)
  return `rgb(${255}, ${200 - intensity * 100}, ${200 - intensity * 100})`
}
