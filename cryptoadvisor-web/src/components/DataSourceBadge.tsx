import { dataSource } from '../api/live/index'

/**
 * Small badge in the header showing whether the dashboard is reading from
 * the in-memory mock layer or live exchange APIs (CoinGecko + Binance WS).
 *
 * Build-time only — VITE_LIVE_PRICES is baked into the bundle.
 */
export default function DataSourceBadge() {
  const source = dataSource()
  const live = source === 'live'

  return (
    <span
      data-testid="data-source-badge"
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wide ${
        live
          ? 'bg-emerald-500/15 text-emerald-300'
          : 'bg-slate-500/15 text-slate-300'
      }`}
      title={
        live
          ? 'Reading from CoinGecko + Binance WebSocket'
          : 'Reading from in-memory mock data layer'
      }
    >
      <span
        aria-hidden="true"
        className={`w-1.5 h-1.5 rounded-full ${
          live ? 'bg-emerald-400 animate-pulse' : 'bg-slate-400'
        }`}
      />
      {source}
    </span>
  )
}
