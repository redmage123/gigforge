/**
 * Options page (Sprint 11, STORY-1108).
 *
 * Live BTC/ETH options chain from Deribit (free, no API key). Renders:
 *   - Currency toggle + expiry selector
 *   - Chain table: strike × expiry, calls left, puts right, with mark/IV/greeks
 *   - Volatility-smile chart for the selected expiry
 *   - ATM IV + put/call skew StatCards
 */
import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { buildOptionChain, type DeribitCurrency, type OptionChain } from '../api/deribit'
import {
  atmRow,
  buildVolatilitySmile,
  putCallSkew,
} from '../utils/optionAnalytics'
import Panel from '../components/ui/Panel'
import StatCard from '../components/ui/StatCard'
import LoadingSkeleton from '../components/ui/LoadingSkeleton'
import ErrorBanner from '../components/ui/ErrorBanner'
import { CHART_COLORS } from '../types/index'

function pct(n: number, digits = 1): string {
  return Number.isFinite(n) ? `${(n * 100).toFixed(digits)}%` : '—'
}

function fmt(n: number | null | undefined, digits = 2): string {
  return typeof n === 'number' && Number.isFinite(n) ? n.toFixed(digits) : '—'
}

export default function Options() {
  const [currency, setCurrency] = useState<DeribitCurrency>('BTC')
  const [expiryIndex, setExpiryIndex] = useState(0)

  const { data: chains, isLoading, isError } = useQuery({
    queryKey: ['deribit-chain', currency],
    queryFn: () => buildOptionChain(currency),
    staleTime: 30_000,
  })

  // Reset expiry index when currency changes.
  useEffect(() => {
    setExpiryIndex(0)
  }, [currency])

  const selected: OptionChain | null = chains?.[expiryIndex] ?? null
  const smile = useMemo(() => (selected ? buildVolatilitySmile(selected) : []), [selected])
  const atm = useMemo(() => (selected ? atmRow(selected) : null), [selected])
  const skew = useMemo(() => (selected ? putCallSkew(selected) : 0), [selected])
  const atmIv = atm?.call?.mark_iv ?? atm?.put?.mark_iv ?? 0

  if (isLoading) return <LoadingSkeleton rows={8} />
  if (isError) return <ErrorBanner />
  if (!chains || chains.length === 0) return <ErrorBanner />

  return (
    <div className="space-y-4">
      <Panel title="Options (Deribit)">
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <div role="group" aria-label="Currency" className="flex gap-1">
            {(['BTC', 'ETH'] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCurrency(c)}
                className={`px-3 py-1.5 text-xs font-semibold rounded ${
                  currency === c
                    ? 'bg-accent text-white'
                    : 'bg-bg-elevated text-text-secondary'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
          <label htmlFor="opt-exp" className="text-sm text-text-secondary">
            Expiry
          </label>
          <select
            id="opt-exp"
            value={expiryIndex}
            onChange={(e) => setExpiryIndex(Number(e.target.value))}
            className="bg-bg-elevated border border-bg-border rounded px-3 py-1.5 text-sm text-text-primary"
          >
            {chains.map((c, i) => (
              <option key={i} value={i}>
                {c.expiryLabel}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <StatCard
            label="Underlying"
            value={selected ? `$${selected.underlyingPrice.toLocaleString()}` : '—'}
          />
          <StatCard label="ATM IV" value={pct(atmIv)} />
          <StatCard
            label="Put/Call Skew"
            value={pct(skew, 2)}
            change={skew > 0 ? 'downside fear' : skew < 0 ? 'upside greed' : 'neutral'}
            changeType={skew > 0 ? 'negative' : skew < 0 ? 'positive' : 'neutral'}
          />
          <StatCard
            label="Strikes"
            value={selected ? String(selected.rows.length) : '—'}
          />
        </div>

        <div className="h-72">
          <h3 className="text-sm font-semibold text-text-primary mb-2">Volatility Smile</h3>
          <ResponsiveContainer width="100%" height="90%">
            <LineChart data={smile} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
              <XAxis
                dataKey="strike"
                tick={{ fill: CHART_COLORS.text, fontSize: 10 }}
                tickFormatter={(v: number) =>
                  new Intl.NumberFormat('en-US', { notation: 'compact' }).format(v)
                }
              />
              <YAxis
                tick={{ fill: CHART_COLORS.text, fontSize: 10 }}
                tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
                width={36}
              />
              <Tooltip
                formatter={(v: unknown) =>
                  typeof v === 'number' ? `${(v * 100).toFixed(1)}%` : '-'
                }
                contentStyle={{
                  backgroundColor: CHART_COLORS.elevated,
                  border: `1px solid ${CHART_COLORS.grid}`,
                  fontSize: 11,
                }}
              />
              <Line
                type="monotone"
                dataKey="callIv"
                stroke={CHART_COLORS.positive}
                dot={false}
                isAnimationActive={false}
                name="Call IV"
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="putIv"
                stroke={CHART_COLORS.negative}
                dot={false}
                isAnimationActive={false}
                name="Put IV"
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <Panel title={`Chain — ${selected?.expiryLabel ?? ''}`}>
        <div className="overflow-x-auto">
          <table className="text-xs w-full">
            <thead className="text-text-secondary">
              <tr>
                <th colSpan={4} className="text-center bg-emerald-900/20 px-2 py-1">CALLS</th>
                <th rowSpan={2} className="px-2 py-1 text-text-primary">Strike</th>
                <th colSpan={4} className="text-center bg-rose-900/20 px-2 py-1">PUTS</th>
              </tr>
              <tr>
                <th className="px-2 py-1">IV</th>
                <th className="px-2 py-1">Δ</th>
                <th className="px-2 py-1">Bid</th>
                <th className="px-2 py-1">Ask</th>
                <th className="px-2 py-1">Bid</th>
                <th className="px-2 py-1">Ask</th>
                <th className="px-2 py-1">Δ</th>
                <th className="px-2 py-1">IV</th>
              </tr>
            </thead>
            <tbody>
              {selected?.rows.map((row) => (
                <tr key={row.strike} className="border-t border-bg-border">
                  <td className="px-2 py-1 text-right font-mono">{pct(row.call?.mark_iv ?? 0)}</td>
                  <td className="px-2 py-1 text-right font-mono">{fmt(row.call?.delta, 2)}</td>
                  <td className="px-2 py-1 text-right font-mono">{fmt(row.call?.bid_price, 4)}</td>
                  <td className="px-2 py-1 text-right font-mono">{fmt(row.call?.ask_price, 4)}</td>
                  <td className="px-2 py-1 text-center font-mono font-semibold">
                    {row.strike.toLocaleString()}
                  </td>
                  <td className="px-2 py-1 text-right font-mono">{fmt(row.put?.bid_price, 4)}</td>
                  <td className="px-2 py-1 text-right font-mono">{fmt(row.put?.ask_price, 4)}</td>
                  <td className="px-2 py-1 text-right font-mono">{fmt(row.put?.delta, 2)}</td>
                  <td className="px-2 py-1 text-right font-mono">{pct(row.put?.mark_iv ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  )
}
