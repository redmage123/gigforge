import { useState } from 'react'
import { useAlerts } from '../hooks/useAlerts'
import Panel from '../components/ui/Panel'
import Badge from '../components/ui/Badge'
import LoadingSkeleton from '../components/ui/LoadingSkeleton'
import ErrorBanner from '../components/ui/ErrorBanner'
import EmptyState from '../components/ui/EmptyState'
import PersistedAlertsPanel from '../components/PersistedAlertsPanel'
import type { Alert } from '../types/index'

type Filter = 'ALL' | 'ACTIVE' | 'TRIGGERED'

function formatUSD(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

function AlertCard({ alert }: { alert: Alert }) {
  return (
    <div
      className={`p-4 rounded-lg border transition-colors ${
        alert.triggered
          ? 'border-negative/30 bg-[var(--color-negative-bg)] opacity-80'
          : 'border-bg-border bg-bg-elevated'
      }`}
    >
      <div className="flex items-center justify-between gap-3 mb-2">
        <span className="font-mono font-bold text-base text-text-primary">{alert.asset}</span>
        <Badge variant={alert.triggered ? 'triggered' : 'active'}>
          {alert.triggered ? 'Triggered' : 'Active'}
        </Badge>
      </div>
      <p className="text-sm text-text-secondary mb-1">
        Price {alert.condition} {formatUSD(alert.threshold)}
      </p>
      <div className="flex items-center gap-4 text-xs">
        <span className="text-text-muted">
          Current: <span className="font-mono tabular-nums text-text-secondary">{formatUSD(alert.currentPrice)}</span>
        </span>
        <span className="text-text-muted">
          Set: <span className="text-text-secondary">{new Date(alert.createdAt).toLocaleDateString()}</span>
        </span>
      </div>
    </div>
  )
}

export default function Alerts() {
  const { data, isLoading, isError } = useAlerts()
  const [filter, setFilter] = useState<Filter>('ALL')

  const activeCount = data?.filter((a) => !a.triggered).length ?? 0
  const triggeredCount = data?.filter((a) => a.triggered).length ?? 0
  const allCount = data?.length ?? 0

  const filtered = data?.filter((a) => {
    if (filter === 'ACTIVE') return !a.triggered
    if (filter === 'TRIGGERED') return a.triggered
    return true
  }) ?? []

  const filterButtons: { label: string; value: Filter; count: number }[] = [
    { label: 'All', value: 'ALL', count: allCount },
    { label: 'Active', value: 'ACTIVE', count: activeCount },
    { label: 'Triggered', value: 'TRIGGERED', count: triggeredCount },
  ]

  return (
    <div className="space-y-4">
      <Panel title="Price Alerts">
        {/* Filter tabs */}
        <div className="flex gap-2 mb-4 flex-wrap" role="tablist" aria-label="Filter alerts">
          {filterButtons.map(({ label, value, count }) => (
            <button
              key={value}
              role="tab"
              aria-selected={filter === value}
              onClick={() => setFilter(value)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-accent min-h-[44px] ${
                filter === value
                  ? 'bg-accent text-white'
                  : 'bg-bg-elevated text-text-secondary hover:bg-bg-border hover:text-text-primary'
              }`}
            >
              {label}
              <span
                className={`text-xs px-1.5 py-0.5 rounded-full font-mono ${
                  filter === value ? 'bg-white/20 text-white' : 'bg-bg-border text-text-muted'
                }`}
              >
                {count}
              </span>
            </button>
          ))}
        </div>

        {isLoading ? (
          <LoadingSkeleton rows={5} />
        ) : isError ? (
          <ErrorBanner />
        ) : filtered.length === 0 ? (
          <EmptyState title="No alerts" description="No alerts match the current filter." />
        ) : (
          <div className="space-y-3">
            {filtered.map((alert) => (
              <AlertCard key={alert.id} alert={alert} />
            ))}
          </div>
        )}
      </Panel>
    </div>
  )
}
