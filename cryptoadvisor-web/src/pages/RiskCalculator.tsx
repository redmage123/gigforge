import { useState } from 'react'
import Panel from '../components/ui/Panel'
import ErrorBanner from '../components/ui/ErrorBanner'
import { useRiskCalculator } from '../hooks/useRiskCalculator'
import { useCmsApi } from '../api/cms/client'

interface AllocationRow {
  symbol: string
  pct: string
}

const INITIAL_ROWS: AllocationRow[] = [
  { symbol: 'BTC', pct: '50' },
  { symbol: 'ETH', pct: '30' },
  { symbol: 'USD', pct: '20' },
]

const TIER_BADGE: Record<'low' | 'medium' | 'high', string> = {
  low: 'bg-emerald-500/15 text-emerald-300',
  medium: 'bg-amber-500/15 text-amber-300',
  high: 'bg-rose-500/15 text-rose-300',
}

export default function RiskCalculator() {
  const cmsAvailable = useCmsApi()
  const [rows, setRows] = useState<AllocationRow[]>(INITIAL_ROWS)
  const mutation = useRiskCalculator()

  function update(index: number, patch: Partial<AllocationRow>) {
    setRows((rs) => rs.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }

  function addRow() {
    setRows((rs) => [...rs, { symbol: '', pct: '0' }])
  }

  function removeRow(index: number) {
    setRows((rs) => rs.filter((_, i) => i !== index))
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const allocations = rows
      .filter((r) => r.symbol.trim())
      .map((r) => ({ symbol: r.symbol.trim().toUpperCase(), pct: Number(r.pct) }))
    mutation.mutate({ allocations })
  }

  const total = rows.reduce((acc, r) => acc + (Number(r.pct) || 0), 0)
  const sumOk = Math.abs(total - 100) <= 0.5

  if (!cmsAvailable) {
    return (
      <Panel title="Portfolio Risk Calculator">
        <div className="text-text-muted">
          Risk Calculator requires the CMS backend. Set <code>VITE_CMS_URL</code> at build time.
        </div>
      </Panel>
    )
  }

  return (
    <div className="space-y-6">
      <Panel title="Portfolio Risk Calculator">
        <p className="text-sm text-text-muted mb-4">
          Enter portfolio allocations as percentages (must sum to 100). Get a Herfindahl-Hirschman Index
          (HHI) concentration score, diversification score (0-100), and a risk tier label.
        </p>

        <form onSubmit={submit} className="space-y-3" data-testid="risk-form">
          {rows.map((row, i) => (
            <div key={i} className="flex gap-2 items-center">
              <input
                type="text"
                value={row.symbol}
                onChange={(e) => update(i, { symbol: e.target.value })}
                placeholder="Symbol (BTC)"
                className="flex-1 px-3 py-2 rounded bg-bg-elevated border border-border-default text-text-primary"
                aria-label={`Symbol row ${i + 1}`}
              />
              <input
                type="number"
                value={row.pct}
                onChange={(e) => update(i, { pct: e.target.value })}
                placeholder="%"
                min={0}
                max={100}
                step="0.1"
                className="w-24 px-3 py-2 rounded bg-bg-elevated border border-border-default text-text-primary"
                aria-label={`Percent row ${i + 1}`}
              />
              <button
                type="button"
                onClick={() => removeRow(i)}
                className="px-3 py-2 text-text-muted hover:text-rose-300"
                aria-label={`Remove row ${i + 1}`}
                disabled={rows.length <= 1}
              >
                ✕
              </button>
            </div>
          ))}

          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={addRow}
              className="text-sm text-accent-primary hover:underline"
            >
              + Add asset
            </button>
            <div className={sumOk ? 'text-emerald-400 text-sm' : 'text-amber-400 text-sm'}>
              Total: {total.toFixed(1)}% {sumOk ? '✓' : '(must equal 100)'}
            </div>
          </div>

          <button
            type="submit"
            disabled={!sumOk || mutation.isPending}
            className="w-full py-2 rounded bg-accent-primary text-bg-base font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {mutation.isPending ? 'Calculating…' : 'Calculate risk'}
          </button>
        </form>
      </Panel>

      {mutation.isError && (
        <ErrorBanner message={mutation.error.message ?? 'Failed to calculate risk'} />
      )}

      {mutation.data && (
        <Panel title="Risk Analysis">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <Stat label="HHI" value={mutation.data.hhi.toFixed(4)} />
            <Stat label="Diversification" value={`${mutation.data.diversificationScore}/100`} />
            <div>
              <div className="text-xs text-text-muted uppercase tracking-wide mb-1">Risk tier</div>
              <span
                className={`px-3 py-1 rounded-full text-sm font-semibold uppercase ${TIER_BADGE[mutation.data.riskTier]}`}
                data-testid="risk-tier"
              >
                {mutation.data.riskTier}
              </span>
            </div>
            <Stat label="Largest" value={`${mutation.data.largestPosition.symbol} ${mutation.data.largestPosition.pct}%`} />
          </div>
          <p className="text-sm text-text-secondary border-t border-border-default pt-4">
            {mutation.data.breakdown}
          </p>
        </Panel>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-text-muted uppercase tracking-wide mb-1">{label}</div>
      <div className="text-lg font-semibold text-text-primary">{value}</div>
    </div>
  )
}
