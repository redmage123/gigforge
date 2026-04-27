import { useState } from 'react'
import Panel from './ui/Panel'
import {
  useAddToWatchlist,
  usePersistedWatchlist,
  useRemoveFromWatchlist,
} from '../hooks/usePersistedWatchlist'
import { useCmsApi } from '../api/cms/client'

/**
 * Sprint 5 — additive panel that demonstrates CMS-persisted watchlist
 * (separate from the legacy mock watchlist on /watchlist).
 *
 * Renders nothing when the CMS is not configured.
 */
export default function PersistedWatchlistPanel() {
  const cmsAvailable = useCmsApi()
  const { data, isLoading, isError } = usePersistedWatchlist()
  const add = useAddToWatchlist()
  const remove = useRemoveFromWatchlist()
  const [symbolInput, setSymbolInput] = useState('')
  const [nameInput, setNameInput] = useState('')

  if (!cmsAvailable) return null

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!symbolInput.trim()) return
    add.mutate(
      { symbol: symbolInput.trim().toUpperCase(), name: nameInput.trim() || symbolInput.trim() },
      { onSuccess: () => { setSymbolInput(''); setNameInput('') } },
    )
  }

  return (
    <Panel title="Persisted Watchlist (CMS)">
      <form onSubmit={submit} className="flex gap-2 mb-3" data-testid="persisted-watchlist-form">
        <input
          type="text"
          value={symbolInput}
          onChange={(e) => setSymbolInput(e.target.value)}
          placeholder="Symbol (e.g. BTC)"
          className="flex-1 px-3 py-2 rounded bg-bg-elevated border border-bg-border text-text-primary"
          aria-label="Asset symbol"
        />
        <input
          type="text"
          value={nameInput}
          onChange={(e) => setNameInput(e.target.value)}
          placeholder="Name (optional)"
          className="flex-1 px-3 py-2 rounded bg-bg-elevated border border-bg-border text-text-primary"
          aria-label="Asset name"
        />
        <button
          type="submit"
          disabled={!symbolInput.trim() || add.isPending}
          className="px-4 py-2 rounded bg-accent text-white font-semibold disabled:opacity-50"
        >
          {add.isPending ? 'Adding…' : 'Add'}
        </button>
      </form>

      {add.isError && <div className="text-rose-400 text-sm mb-2">{add.error.message}</div>}

      {isLoading && <div className="text-text-muted text-sm">Loading…</div>}
      {isError && <div className="text-rose-400 text-sm">Failed to load watchlist</div>}

      {data && data.length === 0 && (
        <div className="text-text-muted text-sm" data-testid="persisted-watchlist-empty">
          Your persisted watchlist is empty. Add an asset above.
        </div>
      )}

      {data && data.length > 0 && (
        <ul className="space-y-1" data-testid="persisted-watchlist-list">
          {data.map((entry) => (
            <li
              key={entry.id}
              className="flex items-center justify-between p-2 rounded bg-bg-elevated"
            >
              <div>
                <span className="font-mono font-semibold text-text-primary">{entry.symbol}</span>
                {entry.name && entry.name !== entry.symbol && (
                  <span className="text-sm text-text-muted ml-2">{entry.name}</span>
                )}
              </div>
              <button
                type="button"
                onClick={() => remove.mutate(entry.id)}
                className="text-text-muted hover:text-rose-400 px-2"
                aria-label={`Remove ${entry.symbol}`}
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
