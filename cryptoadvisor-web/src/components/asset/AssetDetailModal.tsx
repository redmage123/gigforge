import { useEffect } from 'react'
import { useAsset } from '../../hooks/useAsset'

interface AssetDetailModalProps {
  symbol: string | null
  onClose: () => void
}

const TIER_COLOR: Record<'low' | 'medium' | 'high', string> = {
  low: 'text-emerald-400',
  medium: 'text-amber-400',
  high: 'text-rose-400',
}

export default function AssetDetailModal({ symbol, onClose }: AssetDetailModalProps) {
  const { data, isLoading, error } = useAsset(symbol)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    if (symbol) document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [symbol, onClose])

  if (!symbol) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Asset details: ${symbol}`}
      className="fixed inset-0 z-50 flex items-center justify-center"
    >
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative bg-bg-elevated border border-border-default rounded-lg shadow-2xl max-w-md w-full mx-4 p-6">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-text-muted hover:text-text-primary"
          aria-label="Close"
        >
          ✕
        </button>

        {isLoading && (
          <div className="text-text-muted py-8 text-center" data-testid="asset-loading">
            Loading {symbol}…
          </div>
        )}

        {error && (
          <div className="text-rose-400 py-8 text-center" data-testid="asset-error">
            {error.message}
          </div>
        )}

        {data && (
          <div className="space-y-4" data-testid="asset-detail">
            <div>
              <h2 className="text-2xl font-bold text-text-primary">
                {data.name} <span className="text-text-muted">({data.symbol})</span>
              </h2>
              {data.description && (
                <p className="text-sm text-text-secondary mt-1">{data.description}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <Pair label="Risk tier" value={
                <span className={`font-semibold uppercase ${TIER_COLOR[data.riskTier]}`}>{data.riskTier}</span>
              } />
              <Pair label="Market cap" value={data.marketCapTier} />
              {data.chain && <Pair label="Chain" value={data.chain} />}
              <Pair label="Status" value={data.isActive ? 'Active' : 'Inactive'} />
            </div>

            {data.exchanges && data.exchanges.length > 0 && (
              <div>
                <div className="text-xs text-text-muted uppercase tracking-wide mb-1">Exchanges</div>
                <div className="flex flex-wrap gap-1.5">
                  {data.exchanges.map((ex, i) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 rounded bg-bg-base text-xs text-text-secondary border border-border-default"
                    >
                      {ex.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="border-t border-border-default pt-3">
              <div className="text-xs text-text-muted uppercase tracking-wide mb-2">Active signals</div>
              <div className="grid grid-cols-4 gap-2 text-center">
                <SignalCount label="Total" value={data.signalsSummary.total} />
                <SignalCount label="BUY" value={data.signalsSummary.BUY} />
                <SignalCount label="SELL" value={data.signalsSummary.SELL} />
                <SignalCount label="HOLD" value={data.signalsSummary.HOLD} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Pair({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-text-muted uppercase tracking-wide">{label}</div>
      <div className="text-text-primary capitalize">{value}</div>
    </div>
  )
}

function SignalCount({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-bg-base rounded p-2">
      <div className="text-lg font-bold text-text-primary">{value}</div>
      <div className="text-xs text-text-muted">{label}</div>
    </div>
  )
}
