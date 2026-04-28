/**
 * MACD sub-panel — line + signal + colored histogram (STORY-904).
 *
 * Default (12, 26, 9). Histogram bars are green when MACD > signal, red
 * otherwise. Zero-line crossovers stand out via the explicit ReferenceLine.
 */
import { useMemo } from 'react'
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { macd } from '../../utils/indicators'
import { CHART_COLORS } from '../../types/index'
import type { OHLCVCandle } from '../../types/index'

interface MACDPanelProps {
  candles: OHLCVCandle[]
  fast?: number
  slow?: number
  signalPeriod?: number
}

export default function MACDPanel({
  candles,
  fast = 12,
  slow = 26,
  signalPeriod = 9,
}: MACDPanelProps) {
  const data = useMemo(() => {
    const closes = candles.map((c) => c.close)
    const result = macd(closes, fast, slow, signalPeriod)
    return candles.map((c, i) => ({
      date: new Date(c.timestamp).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      }),
      macd: result.macd[i],
      signal: result.signal[i],
      histogram: result.histogram[i],
    }))
  }, [candles, fast, slow, signalPeriod])

  return (
    <div className="space-y-1">
      <div className="text-xs font-semibold text-text-primary">
        MACD({fast}, {slow}, {signalPeriod})
      </div>
      <ResponsiveContainer width="100%" height={110}>
        <ComposedChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} vertical={false} />
          <XAxis dataKey="date" hide />
          <YAxis
            orientation="right"
            width={36}
            tick={{ fill: CHART_COLORS.text, fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            formatter={(value: unknown) =>
              typeof value === 'number' ? value.toFixed(4) : '-'
            }
            contentStyle={{
              backgroundColor: CHART_COLORS.elevated,
              border: `1px solid ${CHART_COLORS.grid}`,
              color: CHART_COLORS.text,
              fontSize: 11,
            }}
          />
          <ReferenceLine y={0} stroke={CHART_COLORS.text} strokeDasharray="2 2" />
          <Bar dataKey="histogram" isAnimationActive={false}>
            {data.map((d, i) => (
              <Cell
                key={i}
                fill={(d.histogram ?? 0) >= 0 ? CHART_COLORS.positive : CHART_COLORS.negative}
              />
            ))}
          </Bar>
          <Line
            type="monotone"
            dataKey="macd"
            stroke={CHART_COLORS.accent}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="signal"
            stroke={CHART_COLORS.neutral}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
