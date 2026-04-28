/**
 * RSI sub-panel rendered below the main candlestick chart (STORY-903).
 *
 * Period selector 7/14/21, 70/30 reference lines, color-coded
 * overbought/oversold fill.
 */
import { useMemo, useState } from 'react'
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { rsi } from '../../utils/indicators'
import { CHART_COLORS } from '../../types/index'
import type { OHLCVCandle } from '../../types/index'

interface RSIPanelProps {
  candles: OHLCVCandle[]
}

const PERIOD_OPTIONS = [7, 14, 21] as const
type RSIPeriod = (typeof PERIOD_OPTIONS)[number]

export default function RSIPanel({ candles }: RSIPanelProps) {
  const [period, setPeriod] = useState<RSIPeriod>(14)

  const data = useMemo(() => {
    const closes = candles.map((c) => c.close)
    const series = rsi(closes, period)
    return candles.map((c, i) => {
      const v = series[i]
      return {
        date: new Date(c.timestamp).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        }),
        rsi: v,
        overbought: v !== null && v >= 70 ? v : null,
        oversold: v !== null && v <= 30 ? v : null,
      }
    })
  }, [candles, period])

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-3 text-xs">
        <span className="font-semibold text-text-primary">RSI({period})</span>
        <div className="flex gap-1" role="group" aria-label="RSI period">
          {PERIOD_OPTIONS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              aria-pressed={p === period}
              className={`px-2 py-0.5 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-accent ${
                p === period
                  ? 'bg-accent text-white font-semibold'
                  : 'bg-bg-elevated text-text-secondary hover:bg-bg-border'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={100}>
        <ComposedChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} vertical={false} />
          <XAxis dataKey="date" hide />
          <YAxis
            domain={[0, 100]}
            ticks={[0, 30, 50, 70, 100]}
            orientation="right"
            width={36}
            tick={{ fill: CHART_COLORS.text, fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            formatter={(value: unknown) =>
              typeof value === 'number' ? value.toFixed(2) : '-'
            }
            contentStyle={{
              backgroundColor: CHART_COLORS.elevated,
              border: `1px solid ${CHART_COLORS.grid}`,
              color: CHART_COLORS.text,
              fontSize: 11,
            }}
          />
          <ReferenceLine y={70} stroke={CHART_COLORS.negative} strokeDasharray="3 3" />
          <ReferenceLine y={30} stroke={CHART_COLORS.positive} strokeDasharray="3 3" />
          <Area
            type="monotone"
            dataKey="overbought"
            stroke="none"
            fill={CHART_COLORS.negative}
            fillOpacity={0.25}
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            dataKey="oversold"
            stroke="none"
            fill={CHART_COLORS.positive}
            fillOpacity={0.25}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="rsi"
            stroke={CHART_COLORS.accent}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
