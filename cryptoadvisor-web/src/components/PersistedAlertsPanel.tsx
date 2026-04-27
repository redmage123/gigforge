import { useState } from 'react'
import Panel from './ui/Panel'
import {
  useCreateAlert,
  useDeleteAlert,
  usePersistedAlerts,
} from '../hooks/usePersistedAlerts'
import { useCmsApi } from '../api/cms/client'

const STATUS_BADGE: Record<'active' | 'triggered' | 'expired', string> = {
  active: 'bg-emerald-500/15 text-emerald-300',
  triggered: 'bg-amber-500/15 text-amber-300',
  expired: 'bg-slate-500/15 text-slate-400',
}

export default function PersistedAlertsPanel() {
  const cmsAvailable = useCmsApi()
  const { data, isLoading, isError } = usePersistedAlerts()
  const create = useCreateAlert()
  const remove = useDeleteAlert()
  const [asset, setAsset] = useState('BTC')
  const [condition, setCondition] = useState<'above' | 'below'>('above')
  const [threshold, setThreshold] = useState('50000')

  if (!cmsAvailable) return null

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const num = Number(threshold)
    if (!Number.isFinite(num) || num <= 0) return
    create.mutate(
      { asset: asset.trim().toUpperCase(), condition, threshold: num },
      { onSuccess: () => setThreshold('50000') },
    )
  }

  return (
    <Panel title="Persisted Alerts (CMS)">
      <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-4 gap-2 mb-3" data-testid="persisted-alerts-form">
        <input
          type="text"
          value={asset}
          onChange={(e) => setAsset(e.target.value)}
          placeholder="Asset"
          className="px-3 py-2 rounded bg-bg-elevated border border-bg-border text-text-primary"
          aria-label="Asset"
        />
        <select
          value={condition}
          onChange={(e) => setCondition(e.target.value as 'above' | 'below')}
          className="px-3 py-2 rounded bg-bg-elevated border border-bg-border text-text-primary"
          aria-label="Condition"
        >
          <option value="above">price above</option>
          <option value="below">price below</option>
        </select>
        <input
          type="number"
          value={threshold}
          onChange={(e) => setThreshold(e.target.value)}
          min={0}
          step="0.01"
          placeholder="Threshold"
          className="px-3 py-2 rounded bg-bg-elevated border border-bg-border text-text-primary"
          aria-label="Threshold"
        />
        <button
          type="submit"
          disabled={!asset.trim() || create.isPending}
          className="px-4 py-2 rounded bg-accent text-white font-semibold disabled:opacity-50"
        >
          {create.isPending ? 'Saving…' : 'Create'}
        </button>
      </form>

      {create.isError && <div className="text-rose-400 text-sm mb-2">{create.error.message}</div>}
      {isLoading && <div className="text-text-muted text-sm">Loading…</div>}
      {isError && <div className="text-rose-400 text-sm">Failed to load alerts</div>}

      {data && data.length === 0 && (
        <div className="text-text-muted text-sm" data-testid="persisted-alerts-empty">
          No persisted alerts yet.
        </div>
      )}

      {data && data.length > 0 && (
        <ul className="space-y-1" data-testid="persisted-alerts-list">
          {data.map((entry) => (
            <li
              key={entry.id}
              className="flex items-center justify-between gap-2 p-2 rounded bg-bg-elevated"
            >
              <div className="flex-1 text-sm">
                <span className="font-mono font-semibold text-text-primary">{entry.asset}</span>
                <span className="text-text-muted mx-1">{entry.condition}</span>
                <span className="font-mono tabular-nums text-text-primary">${entry.threshold.toLocaleString()}</span>
              </div>
              <span className={`px-2 py-0.5 rounded text-xs font-semibold uppercase ${STATUS_BADGE[entry.status]}`}>
                {entry.status}
              </span>
              <button
                type="button"
                onClick={() => remove.mutate(entry.id)}
                className="text-text-muted hover:text-rose-400 px-2"
                aria-label={`Delete ${entry.asset} ${entry.condition} ${entry.threshold}`}
                disabled={remove.isPending}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}
