import { useState } from 'react'
import { useWatchlist } from '../hooks/useWatchlist'
import Panel from '../components/ui/Panel'
import Sparkline from '../components/charts/Sparkline'
import LoadingSkeleton from '../components/ui/LoadingSkeleton'
import ErrorBanner from '../components/ui/ErrorBanner'
import { CHART_COLORS } from '../types/index'
import PersistedWatchlistPanel from '../components/PersistedWatchlistPanel'
import type { WatchlistItem } from '../types/index'

type SortKey = 'currentPrice' | 'changePct24h'
type SortDir = 'asc' | 'desc'

function formatUSD(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: value < 1 ? 4 : 2,
    maximumFractionDigits: value < 1 ? 4 : 2,
  }).format(value)
}

function formatPct(value: number): string {
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(2)}%`
}

interface WatchlistRowProps {
  item: WatchlistItem
}

function WatchlistRow({ item }: WatchlistRowProps) {
  return (
    <div className="flex items-center gap-3 p-3 border-b border-bg-border last:border-0 hover:bg-bg-elevated transition-colors rounded-md">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono font-bold text-base text-text-primary">{item.symbol}</span>
          <span className="text-sm text-text-muted truncate">{item.asset}</span>
        </div>
      </div>

      {/* Sparkline */}
      <div className="w-28 flex-shrink-0">
        <Sparkline
          data={item.sparkline}
          height={80}
          color={item.changePct24h >= 0 ? CHART_COLORS.positive : CHART_COLORS.negative}
        />
      </div>

      {/* Price info */}
      <div className="text-right flex-shrink-0 min-w-[110px]">
        <p className="font-mono tabular-nums font-semibold text-text-primary">
          {formatUSD(item.currentPrice)}
        </p>
        <p
          className={`font-mono tabular-nums text-sm ${
            item.changePct24h >= 0 ? 'text-positive' : 'text-negative'
          }`}
        >
          {formatPct(item.changePct24h)}
        </p>
        <p
          className={`font-mono tabular-nums text-xs ${
            item.change24h >= 0 ? 'text-positive' : 'text-negative'
          }`}
        >
          {item.change24h >= 0 ? '+' : ''}{formatUSD(item.change24h)}
        </p>
      </div>
    </div>
  )
}

export default function Watchlist() {
  const { data, isLoading, isError } = useWatchlist()
  const [sortKey, setSortKey] = useState<SortKey>('changePct24h')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  const sorted = data
    ? [...data].sort((a, b) => {
        const diff = a[sortKey] - b[sortKey]
        return sortDir === 'asc' ? diff : -diff
      })
    : []

  return (
    <div className="space-y-4">
      <PersistedWatchlistPanel />
      <Panel title="Watchlist">
        {/* Sort controls */}
        <div className="flex gap-2 mb-4 flex-wrap items-center">
          <span className="text-xs text-text-muted">Sort by:</span>
          {[
            { label: 'Price', key: 'currentPrice' as SortKey },
            { label: '24h Change', key: 'changePct24h' as SortKey },
          ].map(({ label, key }) => (
            <button
              key={key}
              onClick={() => handleSort(key)}
              className={`flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-accent ${
                sortKey === key
                  ? 'bg-accent text-white'
                  : 'bg-bg-elevated text-text-secondary hover:bg-bg-border hover:text-text-primary'
              }`}
              aria-pressed={sortKey === key}
            >
              {label}
              {sortKey === key && (
                <span aria-hidden="true">{sortDir === 'asc' ? ' ↑' : ' ↓'}</span>
              )}
            </button>
          ))}
        </div>

        {isLoading ? (
          <LoadingSkeleton rows={6} />
        ) : isError ? (
          <ErrorBanner />
        ) : (
          <div className="space-y-1">
            {sorted.map((item) => (
              <WatchlistRow key={item.symbol} item={item} />
            ))}
          </div>
        )}
      </Panel>
    </div>
  )
}
