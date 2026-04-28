/**
 * On-chain analytics page (Sprint 12, STORY-1211).
 *
 * Aggregates four free on-chain feeds:
 *   - Mempool.space (BTC tip, fees, mempool depth, hashrate)
 *   - Blockchain.com Charts (historical BTC metrics)
 *   - Etherscan free tier (gas oracle, ETH supply, ETH price)
 *   - DefiLlama (TVL by chain + top protocols)
 */
import { useMemo } from 'react'
import { useQueries } from '@tanstack/react-query'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  getMempoolStats,
  getRecommendedFees,
  getTipHeight,
} from '../api/mempool'
import { getChart } from '../api/blockchainInfo'
import { getEthPrice, getGasOracle } from '../api/etherscan'
import { getChains, getProtocols } from '../api/defiLlama'
import Panel from '../components/ui/Panel'
import StatCard from '../components/ui/StatCard'
import LoadingSkeleton from '../components/ui/LoadingSkeleton'
import { CHART_COLORS } from '../types/index'

function fmtUsd(n: number, compact = true): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: compact ? 'compact' : 'standard',
    maximumFractionDigits: compact ? 1 : 2,
  }).format(n)
}

function fmtNum(n: number, digits = 0): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: digits }).format(n)
}

export default function OnChain() {
  const queries = useQueries({
    queries: [
      { queryKey: ['mempool-tip'], queryFn: getTipHeight, staleTime: 30_000 },
      { queryKey: ['mempool-fees'], queryFn: getRecommendedFees, staleTime: 30_000 },
      { queryKey: ['mempool-stats'], queryFn: getMempoolStats, staleTime: 30_000 },
      {
        queryKey: ['bc-hashrate'],
        queryFn: () => getChart('hash-rate', '90days'),
        staleTime: 300_000,
      },
      {
        queryKey: ['bc-txns'],
        queryFn: () => getChart('n-transactions', '90days'),
        staleTime: 300_000,
      },
      { queryKey: ['eth-gas'], queryFn: getGasOracle, staleTime: 30_000 },
      { queryKey: ['eth-price'], queryFn: getEthPrice, staleTime: 30_000 },
      { queryKey: ['defillama-chains'], queryFn: getChains, staleTime: 300_000 },
      { queryKey: ['defillama-protocols'], queryFn: getProtocols, staleTime: 300_000 },
    ],
  })

  const [tipQ, feesQ, mempoolQ, hashrateQ, txnsQ, gasQ, ethPriceQ, chainsQ, protocolsQ] = queries

  // Render the shell immediately; each panel handles its own data state.
  const allFailed = queries.every((q) => q.isError)
  if (allFailed) return <LoadingSkeleton rows={8} />

  const hashrateChart = useMemo(
    () =>
      (hashrateQ.data ?? []).map((d) => ({
        date: new Date(d.x * 1000).toLocaleDateString(),
        // hash rate scaled to EH/s for readability
        value: d.y / 1e18,
      })),
    [hashrateQ.data],
  )

  const topChains = useMemo(
    () => (chainsQ.data ?? []).sort((a, b) => b.tvl - a.tvl).slice(0, 10),
    [chainsQ.data],
  )

  const topProtocols = useMemo(
    () => (protocolsQ.data ?? []).sort((a, b) => b.tvl - a.tvl).slice(0, 10),
    [protocolsQ.data],
  )

  return (
    <div className="space-y-4">
      <Panel title="Bitcoin On-Chain (Mempool.space)">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Block Height" value={tipQ.data ? fmtNum(tipQ.data) : '—'} />
          <StatCard
            label="Fast Fee"
            value={feesQ.data ? `${feesQ.data.fastestFee} sat/vB` : '—'}
          />
          <StatCard
            label="Mempool Tx"
            value={mempoolQ.data ? fmtNum(mempoolQ.data.count) : '—'}
          />
          <StatCard
            label="Mempool vSize"
            value={mempoolQ.data ? `${(mempoolQ.data.vsize / 1e6).toFixed(1)} MvB` : '—'}
          />
        </div>
      </Panel>

      <Panel title="BTC Hashrate — 90 days (Blockchain.com)">
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={hashrateChart} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
              <XAxis dataKey="date" tick={{ fill: CHART_COLORS.text, fontSize: 10 }} />
              <YAxis
                tick={{ fill: CHART_COLORS.text, fontSize: 10 }}
                tickFormatter={(v: number) => `${v.toFixed(0)}`}
                width={36}
                label={{
                  value: 'EH/s',
                  fill: CHART_COLORS.text,
                  fontSize: 10,
                  angle: -90,
                  position: 'insideLeft',
                }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: CHART_COLORS.elevated,
                  border: `1px solid ${CHART_COLORS.grid}`,
                  fontSize: 11,
                }}
                formatter={(v: unknown) =>
                  typeof v === 'number' ? `${v.toFixed(0)} EH/s` : '-'
                }
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke={CHART_COLORS.neutral}
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <Panel title="Ethereum (Etherscan)">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            label="Safe Gas"
            value={gasQ.data ? `${gasQ.data.SafeGasPrice} gwei` : '—'}
          />
          <StatCard
            label="Propose Gas"
            value={gasQ.data ? `${gasQ.data.ProposeGasPrice} gwei` : '—'}
          />
          <StatCard
            label="Fast Gas"
            value={gasQ.data ? `${gasQ.data.FastGasPrice} gwei` : '—'}
          />
          <StatCard
            label="ETH Price"
            value={ethPriceQ.data ? fmtUsd(Number(ethPriceQ.data.ethusd), false) : '—'}
          />
        </div>
      </Panel>

      <Panel title="DeFi TVL by Chain (DefiLlama)">
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={topChains.map((c) => ({ name: c.name, tvl: c.tvl }))}
              margin={{ top: 4, right: 8, left: 0, bottom: 32 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
              <XAxis
                dataKey="name"
                tick={{ fill: CHART_COLORS.text, fontSize: 10 }}
                interval={0}
                angle={-30}
                textAnchor="end"
                height={64}
              />
              <YAxis
                tick={{ fill: CHART_COLORS.text, fontSize: 10 }}
                tickFormatter={(v: number) => fmtUsd(v, true)}
                width={56}
              />
              <Tooltip
                formatter={(v: unknown) =>
                  typeof v === 'number' ? fmtUsd(v, false) : '-'
                }
                contentStyle={{
                  backgroundColor: CHART_COLORS.elevated,
                  border: `1px solid ${CHART_COLORS.grid}`,
                  fontSize: 11,
                }}
              />
              <Bar dataKey="tvl" fill={CHART_COLORS.accent} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <Panel title="Top 10 DeFi Protocols">
        <div className="overflow-x-auto">
          <table className="text-sm w-full">
            <thead className="text-xs text-text-secondary">
              <tr>
                <th className="text-left py-1">Protocol</th>
                <th className="text-left py-1">Chain</th>
                <th className="text-left py-1">Category</th>
                <th className="text-right py-1">TVL</th>
                <th className="text-right py-1">1d</th>
                <th className="text-right py-1">7d</th>
              </tr>
            </thead>
            <tbody>
              {topProtocols.map((p) => (
                <tr key={p.id} className="border-t border-bg-border">
                  <td className="py-1 font-semibold text-text-primary">{p.name}</td>
                  <td className="py-1 text-text-secondary">{p.chain}</td>
                  <td className="py-1 text-text-muted">{p.category}</td>
                  <td className="py-1 text-right font-mono">{fmtUsd(p.tvl, true)}</td>
                  <td
                    className={`py-1 text-right font-mono ${
                      p.change_1d >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {p.change_1d?.toFixed(2)}%
                  </td>
                  <td
                    className={`py-1 text-right font-mono ${
                      p.change_7d >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {p.change_7d?.toFixed(2)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  )
}
