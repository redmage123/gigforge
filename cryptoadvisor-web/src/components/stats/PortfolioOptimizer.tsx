/**
 * Portfolio optimizer panel (Sprint 10, STORY-1008/1009).
 *
 * Renders:
 *   - Efficient frontier as a Recharts scatter (return vs volatility)
 *   - Highlighted tangency, minimum-variance, and risk-parity points
 *   - Quantum-inspired annealed solution (with honest framing)
 *   - Per-strategy weight tables
 */
import { useMemo, useState } from 'react'
import {
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  computePortfolioStats,
  efficientFrontier,
  minimumVariancePortfolio,
  quantumAnnealPortfolio,
  riskParityPortfolio,
  tangencyPortfolio,
  type PortfolioMetrics,
} from '../../utils/portfolio'
import { CHART_COLORS } from '../../types/index'

interface PortfolioOptimizerProps {
  series: Record<string, number[]>
}

function pct(n: number, digits = 2): string {
  return Number.isFinite(n) ? `${(n * 100).toFixed(digits)}%` : '—'
}

function fmt(n: number, digits = 2): string {
  return Number.isFinite(n) ? n.toFixed(digits) : '—'
}

export default function PortfolioOptimizer({ series }: PortfolioOptimizerProps) {
  const [iterations, setIterations] = useState(1000)

  const stats = useMemo(() => computePortfolioStats({ series }), [series])

  const frontier = useMemo(() => efficientFrontier(stats, 30), [stats])
  const tangency = useMemo(() => tangencyPortfolio(stats), [stats])
  const minVar = useMemo(() => minimumVariancePortfolio(stats), [stats])
  const riskParity = useMemo(() => riskParityPortfolio(stats), [stats])
  const annealed = useMemo(
    () => quantumAnnealPortfolio(stats, { iterations, seed: 42 }),
    [stats, iterations],
  )

  if (stats.symbols.length === 0) {
    return <p className="text-text-muted">Select assets to optimize.</p>
  }

  const frontierPoints = frontier.map((p) => ({
    x: p.volatility,
    y: p.expectedReturn,
  }))
  const tangencyPoint = [{ x: tangency.volatility, y: tangency.expectedReturn }]
  const minVarPoint = [{ x: minVar.volatility, y: minVar.expectedReturn }]
  const riskParityPoint = [{ x: riskParity.volatility, y: riskParity.expectedReturn }]
  const annealedPoint = [{ x: annealed.volatility, y: annealed.expectedReturn }]

  return (
    <div className="space-y-4">
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
            <XAxis
              type="number"
              dataKey="x"
              name="Volatility"
              tick={{ fill: CHART_COLORS.text, fontSize: 10 }}
              tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
              label={{
                value: 'Annual volatility',
                fill: CHART_COLORS.text,
                fontSize: 11,
                position: 'insideBottom',
                offset: -5,
              }}
            />
            <YAxis
              type="number"
              dataKey="y"
              name="Return"
              tick={{ fill: CHART_COLORS.text, fontSize: 10 }}
              tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
              label={{
                value: 'Annual return',
                fill: CHART_COLORS.text,
                fontSize: 11,
                angle: -90,
                position: 'insideLeft',
              }}
            />
            <Tooltip
              cursor={{ strokeDasharray: '3 3' }}
              contentStyle={{
                backgroundColor: CHART_COLORS.elevated,
                border: `1px solid ${CHART_COLORS.grid}`,
                fontSize: 11,
              }}
              formatter={(v: unknown) =>
                typeof v === 'number' ? `${(v * 100).toFixed(2)}%` : '-'
              }
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Scatter name="Efficient frontier" data={frontierPoints} fill={CHART_COLORS.accent} />
            <Scatter name="Tangency (max Sharpe)" data={tangencyPoint} fill={CHART_COLORS.positive} />
            <Scatter name="Min variance" data={minVarPoint} fill={CHART_COLORS.neutral} />
            <Scatter name="Risk parity" data={riskParityPoint} fill="#a78bfa" />
            <Scatter
              name="Quantum-annealed"
              data={annealedPoint}
              fill={CHART_COLORS.negative}
              shape="cross"
            />
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <WeightsTable label="Tangency (max Sharpe)" symbols={stats.symbols} metrics={tangency} />
        <WeightsTable label="Minimum Variance" symbols={stats.symbols} metrics={minVar} />
        <WeightsTable label="Risk Parity" symbols={stats.symbols} metrics={riskParity} />
        <div className="space-y-2">
          <WeightsTable
            label="Quantum-annealed"
            symbols={stats.symbols}
            metrics={annealed}
          />
          <div className="flex items-center gap-2 text-xs">
            <label htmlFor="anneal-iter" className="text-text-secondary">
              Iterations
            </label>
            <input
              id="anneal-iter"
              type="number"
              value={iterations}
              min={100}
              max={5000}
              step={100}
              onChange={(e) => setIterations(Number(e.target.value))}
              className="bg-bg-elevated border border-bg-border rounded px-2 py-1 w-20 text-text-primary"
            />
          </div>
          <p className="text-xs text-text-muted">
            <span className="font-semibold">Honest framing:</span> the quantum-inspired
            annealer runs in pure JS and offers no speed advantage over the classical
            solvers above at this asset-set size. Real quantum-hardware acceleration
            (D-Wave / IBM Qiskit) requires a backend service — tracked separately.
          </p>
        </div>
      </div>
    </div>
  )
}

interface WeightsTableProps {
  label: string
  symbols: string[]
  metrics: PortfolioMetrics
}

function WeightsTable({ label, symbols, metrics }: WeightsTableProps) {
  return (
    <div className="bg-bg-elevated rounded p-3">
      <div className="text-xs text-text-muted uppercase tracking-wide mb-2">{label}</div>
      <div className="text-xs space-y-1 mb-2">
        <div>
          <span className="text-text-secondary">Return:</span>{' '}
          <span className="font-mono text-text-primary">{pct(metrics.expectedReturn)}</span>
          <span className="text-text-secondary ml-3">Vol:</span>{' '}
          <span className="font-mono text-text-primary">{pct(metrics.volatility)}</span>
          <span className="text-text-secondary ml-3">Sharpe:</span>{' '}
          <span className="font-mono text-text-primary">{fmt(metrics.sharpe)}</span>
        </div>
      </div>
      <table className="w-full text-xs">
        <tbody>
          {symbols.map((s, i) => (
            <tr key={s}>
              <td className="text-text-secondary py-0.5">{s}</td>
              <td className="text-right font-mono tabular-nums">
                {pct(metrics.weights[i] ?? 0, 1)}
              </td>
              <td className="pl-2 w-1/2">
                <div className="h-1.5 bg-bg-base rounded overflow-hidden">
                  <div
                    className="h-full bg-accent"
                    style={{ width: `${(metrics.weights[i] ?? 0) * 100}%` }}
                    aria-hidden="true"
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
