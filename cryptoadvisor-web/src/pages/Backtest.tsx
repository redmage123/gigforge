/**
 * Backtest page (Sprint 11, STORY-1106).
 *
 * Pick an asset + strategy, runs a backtest over the loaded candle range,
 * shows equity curve vs buy-and-hold, drawdown chart, and summary stats.
 */
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { getPrices } from '../api/index'
import { generateDonchianSignals } from '../utils/signalGenerator'
import { runBacktest, type BacktestSignal } from '../utils/backtest'
import Panel from '../components/ui/Panel'
import StatCard from '../components/ui/StatCard'
import LoadingSkeleton from '../components/ui/LoadingSkeleton'
import ErrorBanner from '../components/ui/ErrorBanner'
import { CHART_COLORS } from '../types/index'
import type { Asset } from '../types/index'

const ASSETS: Asset[] = ['BTC', 'ETH', 'SOL', 'ADA']

type Strategy = 'donchian' | 'buyhold'

function pct(n: number, digits = 2): string {
  return Number.isFinite(n) ? `${(n * 100).toFixed(digits)}%` : '—'
}

function fmt(n: number, digits = 2): string {
  return Number.isFinite(n) ? n.toFixed(digits) : '—'
}

export default function Backtest() {
  const [asset, setAsset] = useState<Asset>('BTC')
  const [strategy, setStrategy] = useState<Strategy>('donchian')

  const pricesQuery = useQuery({
    queryKey: ['prices', asset, '1M'],
    queryFn: () => getPrices(asset, '1M'),
  })

  const result = useMemo(() => {
    const candles = pricesQuery.data?.candles ?? []
    if (candles.length === 0) return null
    let signals: BacktestSignal[] = []
    if (strategy === 'donchian') {
      const generated = generateDonchianSignals(candles, { symbol: asset, period: 20 })
      signals = generated.map((g) => ({
        index: g.index,
        action: g.action === 'BUY' ? 'BUY' : 'SELL',
      }))
    }
    return runBacktest(candles, signals, {})
  }, [pricesQuery.data, strategy, asset])

  if (pricesQuery.isLoading) return <LoadingSkeleton rows={8} />
  if (pricesQuery.isError) return <ErrorBanner />
  if (!result) return null

  const equityChart = result.equityCurve.map((eq, i) => ({
    i,
    strategy: eq,
    buyhold: result.buyHoldEquity[i],
  }))
  const drawdownChart = result.drawdownPct.map((d, i) => ({ i, drawdown: d * 100 }))

  return (
    <div className="space-y-4">
      <Panel title="Backtest">
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <label htmlFor="bt-asset" className="text-sm text-text-secondary">
            Asset
          </label>
          <select
            id="bt-asset"
            value={asset}
            onChange={(e) => setAsset(e.target.value as Asset)}
            className="bg-bg-elevated border border-bg-border rounded px-3 py-1.5 text-sm text-text-primary"
          >
            {ASSETS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <label htmlFor="bt-strat" className="text-sm text-text-secondary ml-3">
            Strategy
          </label>
          <select
            id="bt-strat"
            value={strategy}
            onChange={(e) => setStrategy(e.target.value as Strategy)}
            className="bg-bg-elevated border border-bg-border rounded px-3 py-1.5 text-sm text-text-primary"
          >
            <option value="donchian">Donchian Breakout (20)</option>
            <option value="buyhold">Buy & Hold</option>
          </select>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <StatCard label="Total Return" value={pct(result.totalReturn)} />
          <StatCard label="Buy & Hold" value={pct(result.buyHoldReturn)} />
          <StatCard label="Sharpe" value={fmt(result.sharpe)} />
          <StatCard label="Max Drawdown" value={pct(result.maxDrawdown)} />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4 text-xs">
          <KV label="Trades" value={String(result.trades.length)} />
          <KV label="Hit Rate" value={pct(result.hitRate, 1)} />
          <KV label="Avg Win" value={pct(result.averageWinPct, 2)} />
          <KV label="Avg Loss" value={pct(result.averageLossPct, 2)} />
          <KV
            label="Profit Factor"
            value={Number.isFinite(result.profitFactor) ? fmt(result.profitFactor) : '∞'}
          />
          <KV label="Sortino" value={fmt(result.sortino)} />
        </div>

        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={equityChart} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
              <XAxis dataKey="i" tick={{ fill: CHART_COLORS.text, fontSize: 10 }} />
              <YAxis
                tick={{ fill: CHART_COLORS.text, fontSize: 10 }}
                tickFormatter={(v: number) =>
                  new Intl.NumberFormat('en-US', { notation: 'compact' }).format(v)
                }
                width={56}
              />
              <Tooltip
                formatter={(v: unknown) =>
                  typeof v === 'number'
                    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v)
                    : '-'
                }
                contentStyle={{
                  backgroundColor: CHART_COLORS.elevated,
                  border: `1px solid ${CHART_COLORS.grid}`,
                  fontSize: 11,
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line
                type="monotone"
                dataKey="strategy"
                stroke={CHART_COLORS.positive}
                strokeWidth={1.5}
                dot={false}
                name="Strategy"
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="buyhold"
                stroke={CHART_COLORS.text}
                strokeWidth={1.5}
                strokeDasharray="3 3"
                dot={false}
                name="Buy & Hold"
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <Panel title="Drawdown">
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={drawdownChart} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
              <XAxis dataKey="i" tick={{ fill: CHART_COLORS.text, fontSize: 10 }} />
              <YAxis
                tick={{ fill: CHART_COLORS.text, fontSize: 10 }}
                tickFormatter={(v: number) => `${v.toFixed(0)}%`}
                width={36}
              />
              <Tooltip
                formatter={(v: unknown) =>
                  typeof v === 'number' ? `${v.toFixed(2)}%` : '-'
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
