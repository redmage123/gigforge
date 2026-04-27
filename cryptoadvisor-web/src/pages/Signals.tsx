import { useState } from 'react'
import { useSignals } from '../hooks/useSignals'
import Panel from '../components/ui/Panel'
import Badge from '../components/ui/Badge'
import LoadingSkeleton from '../components/ui/LoadingSkeleton'
import ErrorBanner from '../components/ui/ErrorBanner'
import EmptyState from '../components/ui/EmptyState'
import type { Signal } from '../types/index'

type Filter = 'ALL' | 'BUY' | 'SELL' | 'HOLD'

function relativeTime(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function SignalCard({ signal }: { signal: Signal }) {
  return (
    <div className="p-4 bg-bg-elevated rounded-lg border border-bg-border">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2">
          <span className="font-mono font-bold text-base text-text-primary">{signal.asset}</span>
          <Badge variant={signal.direction.toLowerCase() as 'buy' | 'sell' | 'hold'}>
            {signal.direction}
          </Badge>
        </div>
        <span className="text-xs text-text-muted flex-shrink-0">{relativeTime(signal.timestamp)}</span>
      </div>

      {/* Confidence bar */}
      <div className="mb-2">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-text-secondary">Confidence</span>
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
    </div>
  )
}

const FILTERS: Filter[] = ['ALL', 'BUY', 'SELL', 'HOLD']

export default function Signals() {
  const { data, isLoading, isError } = useSignals()
  const [filter, setFilter] = useState<Filter>('ALL')

  const filtered = data?.filter((s) => filter === 'ALL' || s.direction === filter) ?? []

  return (
    <div className="space-y-4">
      <Panel title="AI Trading Signals">
        {/* Filter buttons */}
        <div className="flex gap-2 mb-4 flex-wrap" role="group" aria-label="Filter signals">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 text-sm font-semibold rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-accent min-h-[44px] ${
                filter === f
                  ? 'bg-accent text-white'
                  : 'bg-bg-elevated text-text-secondary hover:bg-bg-border hover:text-text-primary'
              }`}
              aria-pressed={filter === f}
            >
              {f}
            </button>
          ))}
        </div>

        {isLoading ? (
          <LoadingSkeleton rows={6} />
        ) : isError ? (
          <ErrorBanner />
        ) : filtered.length === 0 ? (
          <EmptyState
            title="No signals"
            description={`No ${filter === 'ALL' ? '' : filter + ' '}signals available.`}
          />
        ) : (
          <div className="space-y-3">
            {filtered.map((signal) => (
              <SignalCard key={signal.id} signal={signal} />
            ))}
          </div>
        )}
      </Panel>
    </div>
  )
}
