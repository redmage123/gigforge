import { useState } from 'react'
import {
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Bar,
  Line,
  Area,
} from 'recharts'
import { usePrices } from '../../hooks/usePrices'
import { CHART_COLORS } from '../../types/index'
import type { Asset, Timeframe } from '../../types/index'
import { ChartSkeleton } from '../ui/LoadingSkeleton'
import ErrorBanner from '../ui/ErrorBanner'
import {
  IndicatorBanners,
  OverlayToggleBar,
  useIndicatorOverlays,
} from './IndicatorOverlays'
import RSIPanel from './RSIPanel'
import MACDPanel from './MACDPanel'

const ASSETS: Asset[] = ['BTC', 'ETH', 'SOL', 'ADA']
const TIMEFRAMES: Timeframe[] = ['1D', '1W', '1M']

interface CandlestickBarProps {
  x?: number
  y?: number
  width?: number
  height?: number
  open?: number
  close?: number
  high?: number
  low?: number
  index?: number
  payload?: {
    open: number
    close: number
    high: number
    low: number
    yHigh?: number
    yLow?: number
    yOpen?: number
    yClose?: number
    candleY?: number
    candleHeight?: number
  }
}

function CandlestickBar(props: CandlestickBarProps) {
  const { x = 0, width = 8, payload } = props

  if (!payload) return null

  const { open, close } = payload
  const isUp = close >= open
  const color = isUp ? CHART_COLORS.positive : CHART_COLORS.negative

  const candleY = Math.min(payload.yOpen ?? 0, payload.yClose ?? 0)
  const candleHeight = Math.abs((payload.yOpen ?? 0) - (payload.yClose ?? 0)) || 1
  const wickX = x + width / 2
  const wickTop = payload.yHigh ?? 0
  const wickBottom = payload.yLow ?? 0

  if (!isFinite(candleY) || !isFinite(candleHeight) || !isFinite(wickTop) || !isFinite(wickBottom)) {
    return null
  }

  return (
    <g>
      <line
        x1={wickX}
        y1={wickTop}
        x2={wickX}
        y2={wickBottom}
        stroke={color}
        strokeWidth={1}
      />
      <rect
        x={x + 1}
        y={candleY}
        width={Math.max(width - 2, 1)}
        height={candleHeight}
        fill={color}
        stroke={color}
        strokeWidth={0.5}
      />
    </g>
  )
}

interface TooltipPayloadItem {
  payload: {
    open: number
    high: number
    low: number
    close: number
    volume: number
    date: string
  }
}

interface CustomTooltipProps {
  active?: boolean
  payload?: TooltipPayloadItem[]
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null
  const d = payload[0]!.payload
  const fmt = (v: number) =>
    new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(v)

  return (
    <div
      className="rounded px-3 py-2 text-xs space-y-1"
      style={{
        backgroundColor: CHART_COLORS.elevated,
        border: `1px solid ${CHART_COLORS.grid}`,
        color: CHART_COLORS.text,
      }}
    >
      <p className="font-semibold" style={{ color: CHART_COLORS.text }}>
        {d.date}
      </p>
      <p>O: <span className="font-mono tabular-nums">{fmt(d.open)}</span></p>
      <p>H: <span className="font-mono tabular-nums">{fmt(d.high)}</span></p>
      <p>L: <span className="font-mono tabular-nums">{fmt(d.low)}</span></p>
      <p>C: <span className="font-mono tabular-nums">{fmt(d.close)}</span></p>
      <p>Vol: <span className="font-mono tabular-nums">{fmt(d.volume)}</span></p>
    </div>
  )
}

interface CandlestickChartProps {
  defaultAsset?: Asset
  defaultTimeframe?: Timeframe
}

export default function CandlestickChart({
  defaultAsset = 'BTC',
  defaultTimeframe = '1D',
}: CandlestickChartProps) {
  const [asset, setAsset] = useState<Asset>(defaultAsset)
  const [timeframe, setTimeframe] = useState<Timeframe>(defaultTimeframe)
  const { data, isLoading, isError } = usePrices(asset, timeframe)
  const candles = data?.candles ?? []
  const { toggles, setToggles, overlays } = useIndicatorOverlays(candles)

  if (isLoading) return <ChartSkeleton />
  if (isError) return <ErrorBanner />

  const chartData = candles.map((c, i) => ({
    date: new Date(c.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume,
    candle: c.close - c.open,
    candleBase: Math.min(c.open, c.close),
    sma20: overlays.sma20?.[i] ?? null,
    sma50: overlays.sma50?.[i] ?? null,
    sma200: overlays.sma200?.[i] ?? null,
    bbUpper: overlays.bollinger?.upper[i] ?? null,
    bbMiddle: overlays.bollinger?.middle[i] ?? null,
    bbLower: overlays.bollinger?.lower[i] ?? null,
  }))

  return (
    <div className="space-y-3">
      {/* Controls */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <select
          value={asset}
          onChange={(e) => setAsset(e.target.value as Asset)}
          className="bg-bg-elevated border border-bg-border rounded px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
          aria-label="Select asset"
        >
          {ASSETS.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <div className="flex gap-1" role="group" aria-label="Select timeframe">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors focus:outline-none focus:ring-2 focus:ring-accent ${
                timeframe === tf
                  ? 'bg-accent text-white'
                  : 'bg-bg-elevated text-text-secondary hover:bg-bg-border'
              }`}
              aria-pressed={timeframe === tf}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      {/* Indicator overlay toggles + banners (Sprint 9, STORY-902/905) */}
      <OverlayToggleBar toggles={toggles} onChange={setToggles} />
      <IndicatorBanners banners={overlays.banners} />

      {/* Price chart with overlays */}
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fill: CHART_COLORS.text, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            orientation="right"
            tick={{ fill: CHART_COLORS.text, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) =>
              new Intl.NumberFormat('en-US', {
                notation: 'compact',
                maximumFractionDigits: 1,
              }).format(v)
            }
            width={60}
          />
          <Tooltip content={<CustomTooltip />} />
          {toggles.bollinger && (
            <>
              <Area
                type="monotone"
                dataKey="bbUpper"
                stroke="#a5b4fc"
                strokeWidth={1}
                fill="#a5b4fc"
                fillOpacity={0.1}
                isAnimationActive={false}
                connectNulls
              />
              <Area
                type="monotone"
                dataKey="bbLower"
                stroke="#a5b4fc"
                strokeWidth={1}
                fill="#a5b4fc"
                fillOpacity={0.1}
                isAnimationActive={false}
                connectNulls
              />
            </>
          )}
          <Bar
            dataKey="candle"
            shape={(props: unknown) => <CandlestickBar {...(props as CandlestickBarProps)} />}
            isAnimationActive={false}
          />
          {toggles.sma20 && (
            <Line
              type="monotone"
              dataKey="sma20"
              stroke={CHART_COLORS.positive}
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
              connectNulls
            />
          )}
          {toggles.sma50 && (
            <Line
              type="monotone"
              dataKey="sma50"
              stroke={CHART_COLORS.neutral}
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
              connectNulls
            />
          )}
          {toggles.sma200 && (
            <Line
              type="monotone"
              dataKey="sma200"
              stroke={CHART_COLORS.accent}
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
              connectNulls
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>

      {/* Volume chart */}
      <ResponsiveContainer width="100%" height={60}>
        <ComposedChart data={chartData} margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
          <XAxis dataKey="date" hide />
          <YAxis orientation="right" hide width={60} />
          <Bar
            dataKey="volume"
            fill={CHART_COLORS.accent}
            opacity={0.4}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>

      {/* Sub-panels (Sprint 9, STORY-903/904) */}
      {candles.length > 0 && (
        <>
          <RSIPanel candles={candles} />
          <MACDPanel candles={candles} />
        </>
      )}
    </div>
  )
}

export { CandlestickBar }
