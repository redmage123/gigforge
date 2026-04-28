/**
 * Order Book page (Sprint 12, STORY-1112).
 *
 * Live multi-exchange L2 orderbook. Subscribes to Binance/Bybit/OKX/Coinbase
 * for the selected symbol, picks the venue with the tightest spread as the
 * default display, and renders:
 *   - Best bid/ask + spread + book imbalance StatCards
 *   - Top-15 ladder (bids left, asks right, color-bar = relative size)
 *   - Cumulative depth chart (bids cyan area, asks magenta area)
 *   - Per-venue spread leaderboard
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  pickBestVenue,
  subscribeOrderBooks,
  type Exchange,
  type OrderBookUpdate,
} from '../api/exchangeFeeds'
import {
  depthChartData,
  summarize,
  type OrderBookState,
} from '../utils/orderBook'
import Panel from '../components/ui/Panel'
import StatCard from '../components/ui/StatCard'
import { CHART_COLORS } from '../types/index'

interface SymbolMap {
  binance: string
  bybit: string
  okx: string
  coinbase: string
}

const SYMBOLS: Record<string, SymbolMap> = {
  BTC: { binance: 'BTCUSDT', bybit: 'BTCUSDT', okx: 'BTC-USDT', coinbase: 'BTC-USD' },
  ETH: { binance: 'ETHUSDT', bybit: 'ETHUSDT', okx: 'ETH-USDT', coinbase: 'ETH-USD' },
  SOL: { binance: 'SOLUSDT', bybit: 'SOLUSDT', okx: 'SOL-USDT', coinbase: 'SOL-USD' },
}

export default function OrderBookPage() {
  const [symbol, setSymbol] = useState<keyof typeof SYMBOLS>('BTC')
  const [feeds, setFeeds] = useState<Record<Exchange, OrderBookUpdate | undefined>>({
    binance: undefined,
    bybit: undefined,
    okx: undefined,
    coinbase: undefined,
  })
  const [errors, setErrors] = useState<Partial<Record<Exchange, string>>>({})
  const feedsRef = useRef(feeds)
  feedsRef.current = feeds

  useEffect(() => {
    setFeeds({ binance: undefined, bybit: undefined, okx: undefined, coinbase: undefined })
    setErrors({})
    const close = subscribeOrderBooks(
      [
        { exchange: 'binance', symbol: SYMBOLS[symbol].binance },
        { exchange: 'bybit', symbol: SYMBOLS[symbol].bybit },
        { exchange: 'okx', symbol: SYMBOLS[symbol].okx },
        { exchange: 'coinbase', symbol: SYMBOLS[symbol].coinbase },
      ],
      {
        onUpdate: (event) => {
          setFeeds((prev) => ({ ...prev, [event.exchange]: event }))
        },
        onError: (exchange, error) => {
          setErrors((prev) => ({ ...prev, [exchange]: error.message }))
        },
      },
    )
    return close
  }, [symbol])

  const bestVenue = pickBestVenue(feeds) ?? 'binance'
  const [displayVenue, setDisplayVenue] = useState<Exchange>('binance')
  useEffect(() => {
    if (!feeds[displayVenue]) setDisplayVenue(bestVenue)
  }, [bestVenue, displayVenue, feeds])

  const book: OrderBookState | null = feeds[displayVenue]?.book ?? null
  const summary = book
    ? summarize(book, 10)
    : { bestBid: null, bestAsk: null, spread: null, spreadBps: null, mid: null, bidVolumeTopK: 0, askVolumeTopK: 0, imbalance: 0.5 }
  const depthData = useMemo(() => (book ? depthChartData(book, 30) : []), [book])

  return (
    <div className="space-y-4">
      <Panel title="Order Book (multi-exchange)">
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <label htmlFor="ob-symbol" className="text-sm text-text-secondary">
            Symbol
          </label>
          <select
            id="ob-symbol"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value as keyof typeof SYMBOLS)}
            className="bg-bg-elevated border border-bg-border rounded px-3 py-1.5 text-sm text-text-primary"
          >
            {Object.keys(SYMBOLS).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <span className="text-xs text-text-muted ml-3">Display venue</span>
          <div className="flex gap-1">
            {(['binance', 'bybit', 'okx', 'coinbase'] as const).map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => setDisplayVenue(ex)}
                className={`px-2 py-1 text-xs font-semibold rounded ${
                  displayVenue === ex
                    ? 'bg-accent text-white'
                    : feeds[ex]
                    ? 'bg-bg-elevated text-text-secondary'
                    : 'bg-bg-base text-text-muted line-through'
                }`}
                title={errors[ex] ?? ''}
                disabled={!feeds[ex]}
              >
                {ex} {ex === bestVenue && feeds[ex] ? '★' : ''}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <StatCard
            label="Best Bid"
            value={summary.bestBid !== null ? summary.bestBid.toLocaleString() : '—'}
          />
          <StatCard
            label="Best Ask"
            value={summary.bestAsk !== null ? summary.bestAsk.toLocaleString() : '—'}
          />
          <StatCard
            label="Spread"
            value={summary.spreadBps !== null ? `${summary.spreadBps.toFixed(1)} bps` : '—'}
          />
          <StatCard
            label="Imbalance (top 10)"
            value={`${(summary.imbalance * 100).toFixed(1)}%`}
            change={summary.imbalance > 0.55 ? 'bid-heavy' : summary.imbalance < 0.45 ? 'ask-heavy' : 'balanced'}
            changeType={summary.imbalance > 0.55 ? 'positive' : summary.imbalance < 0.45 ? 'negative' : 'neutral'}
          />
        </div>
      </Panel>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="Ladder">
          {book ? <Ladder book={book} /> : <p className="text-text-muted">Connecting…</p>}
        </Panel>

        <Panel title="Cumulative Depth">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={depthData}
                margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
                <XAxis
                  dataKey="price"
                  type="number"
                  domain={['dataMin', 'dataMax']}
                  tick={{ fill: CHART_COLORS.text, fontSize: 10 }}
                  tickFormatter={(v: number) =>
                    new Intl.NumberFormat('en-US', { notation: 'compact' }).format(v)
                  }
                />
                <YAxis tick={{ fill: CHART_COLORS.text, fontSize: 10 }} width={56} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: CHART_COLORS.elevated,
                    border: `1px solid ${CHART_COLORS.grid}`,
                    fontSize: 11,
                  }}
                />
                <Area
                  type="stepAfter"
                  dataKey={(d) => (d.side === 'bid' ? d.cumulativeSize : null)}
                  stroke={CHART_COLORS.positive}
                  fill={CHART_COLORS.positive}
                  fillOpacity={0.2}
                  isAnimationActive={false}
                />
                <Area
                  type="stepAfter"
                  dataKey={(d) => (d.side === 'ask' ? d.cumulativeSize : null)}
                  stroke={CHART_COLORS.negative}
                  fill={CHART_COLORS.negative}
                  fillOpacity={0.2}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>
    </div>
  )
}

interface LadderProps {
  book: OrderBookState
}

function Ladder({ book }: LadderProps) {
  const bids = book.bids.slice(0, 15)
  const asks = book.asks.slice(0, 15)
  const maxBid = Math.max(0, ...bids.map((l) => l.size))
  const maxAsk = Math.max(0, ...asks.map((l) => l.size))

  return (
    <div className="grid grid-cols-2 gap-2 text-xs font-mono tabular-nums">
      <div>
        <div className="text-text-muted text-[10px] uppercase mb-1">Bids</div>
        {bids.map((lvl) => (
          <div
            key={lvl.price}
            className="relative flex justify-between px-2 py-0.5 rounded mb-0.5"
            title={`${lvl.size.toFixed(4)} @ ${lvl.price}`}
          >
            <div
              className="absolute inset-y-0 left-0 bg-emerald-500/20 rounded"
              style={{ width: `${(lvl.size / Math.max(maxBid, 1e-9)) * 100}%` }}
              aria-hidden="true"
            />
            <span className="relative text-emerald-400">{lvl.price.toLocaleString()}</span>
            <span className="relative text-text-secondary">{lvl.size.toFixed(4)}</span>
          </div>
        ))}
      </div>
      <div>
        <div className="text-text-muted text-[10px] uppercase mb-1">Asks</div>
        {asks.map((lvl) => (
          <div
            key={lvl.price}
            className="relative flex justify-between px-2 py-0.5 rounded mb-0.5"
            title={`${lvl.size.toFixed(4)} @ ${lvl.price}`}
          >
            <div
              className="absolute inset-y-0 left-0 bg-rose-500/20 rounded"
              style={{ width: `${(lvl.size / Math.max(maxAsk, 1e-9)) * 100}%` }}
              aria-hidden="true"
            />
            <span className="relative text-rose-400">{lvl.price.toLocaleString()}</span>
            <span className="relative text-text-secondary">{lvl.size.toFixed(4)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
