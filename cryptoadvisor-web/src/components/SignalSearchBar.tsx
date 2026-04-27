import { useState } from 'react'
import { useSearchSignals } from '../hooks/useSearchSignals'
import { useCmsApi } from '../api/cms/client'

const DIRECTION_BADGE: Record<'BUY' | 'SELL' | 'HOLD', string> = {
  BUY: 'bg-emerald-500/15 text-emerald-300',
  SELL: 'bg-rose-500/15 text-rose-300',
  HOLD: 'bg-slate-500/15 text-slate-300',
}

export default function SignalSearchBar() {
  const cmsAvailable = useCmsApi()
  const [query, setQuery] = useState('')
  const [direction, setDirection] = useState<'' | 'BUY' | 'SELL' | 'HOLD'>('')
  const [minConfidence, setMinConfidence] = useState(0)

  const search = useSearchSignals(
    {
      q: query,
      direction: direction || undefined,
      minConfidence: minConfidence || undefined,
      limit: 20,
    },
    query.trim().length > 0,
  )

  if (!cmsAvailable) {
    return null
  }

  return (
    <div className="space-y-3" data-testid="signal-search">
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search signals (e.g. bitcoin, accumulation)…"
          className="flex-1 px-3 py-2 rounded bg-bg-elevated border border-border-default text-text-primary"
          aria-label="Search signals"
        />
        <select
          value={direction}
          onChange={(e) => setDirection(e.target.value as typeof direction)}
          className="px-3 py-2 rounded bg-bg-elevated border border-border-default text-text-primary"
          aria-label="Filter by direction"
        >
          <option value="">All directions</option>
          <option value="BUY">BUY</option>
          <option value="SELL">SELL</option>
          <option value="HOLD">HOLD</option>
        </select>
        <input
          type="number"
          value={minConfidence}
          onChange={(e) => setMinConfidence(Number(e.target.value) || 0)}
          min={0}
          max={100}
          step={5}
          className="w-24 px-3 py-2 rounded bg-bg-elevated border border-border-default text-text-primary"
          aria-label="Minimum confidence"
          placeholder="Min %"
        />
      </div>

      {search.isLoading && (
        <div className="text-text-muted text-sm" data-testid="search-loading">
          Searching…
        </div>
      )}

      {search.isError && (
        <div className="text-rose-400 text-sm">{search.error.message}</div>
      )}

      {search.data && search.data.results.length === 0 && (
        <div className="text-text-muted text-sm" data-testid="search-empty">
          No signals match "{search.data.query}".
        </div>
      )}

      {search.data && search.data.results.length > 0 && (
        <ul className="space-y-2" data-testid="search-results">
          {search.data.results.map((sig) => (
            <li
              key={sig.id}
              className="p-3 rounded border border-border-default bg-bg-elevated"
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="font-semibold text-text-primary">{sig.assetSymbol}</span>
                <span className={`px-2 py-0.5 rounded text-xs font-semibold ${DIRECTION_BADGE[sig.direction]}`}>
                  {sig.direction}
                </span>
                <span className="text-xs text-text-muted">{sig.confidence}% confidence</span>
                <span className="ml-auto text-xs text-text-muted">score {sig.score.toFixed(1)}</span>
              </div>
              <p className="text-sm text-text-secondary">{sig.reason}</p>
              {sig.matchedFields.length > 0 && (
                <div className="mt-1 text-xs text-text-muted">
                  matched: {sig.matchedFields.join(', ')}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
