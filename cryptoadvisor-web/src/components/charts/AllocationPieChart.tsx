import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import type { Holding } from '../../types/index'
import { CHART_COLORS } from '../../types/index'
import LoadingSkeleton from '../ui/LoadingSkeleton'
import EmptyState from '../ui/EmptyState'

interface AllocationPieChartProps {
  holdings: Holding[]
  totalValue: number
  isLoading?: boolean
}

function formatUSD(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

interface TooltipPayload {
  name: string
  value: number
  payload: {
    value: number
    allocationPct: number
  }
}

interface CustomTooltipProps {
  active?: boolean
  payload?: TooltipPayload[]
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null
  const item = payload[0]!
  return (
    <div
      className="bg-bg-elevated border border-bg-border rounded px-3 py-2 text-xs"
      style={{ backgroundColor: CHART_COLORS.elevated, border: `1px solid ${CHART_COLORS.grid}` }}
    >
      <p className="font-semibold text-text-primary">{item.name}</p>
      <p className="text-text-secondary font-mono tabular-nums">{formatUSD(item.value)}</p>
      <p className="text-text-secondary font-mono tabular-nums">
        {item.payload.allocationPct.toFixed(1)}%
      </p>
    </div>
  )
}

export default function AllocationPieChart({
  holdings,
  totalValue,
  isLoading,
}: AllocationPieChartProps) {
  if (isLoading) {
    return <LoadingSkeleton rows={4} className="h-40" />
  }

  if (!holdings || holdings.length === 0) {
    return <EmptyState title="No holdings" description="Add holdings to see allocation." />
  }

  const data = holdings.map((h) => ({
    name: h.symbol,
    value: h.value,
    allocationPct: h.allocationPct,
  }))

  return (
    <div className="w-full">
      <ResponsiveContainer width="100%" height={240}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={90}
            paddingAngle={2}
            dataKey="value"
            nameKey="name"
          >
            {data.map((_, index) => (
              <Cell
                key={`cell-${index}`}
                fill={CHART_COLORS.assets[index % CHART_COLORS.assets.length]}
              />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          <Legend
            formatter={(value: string) => (
              <span style={{ color: CHART_COLORS.text, fontSize: '12px' }}>{value}</span>
            )}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="text-center mt-1">
        <span className="text-xs text-text-secondary">Total: </span>
        <span className="text-sm font-mono tabular-nums font-semibold text-text-primary">
          {formatUSD(totalValue)}
        </span>
      </div>
    </div>
  )
}
