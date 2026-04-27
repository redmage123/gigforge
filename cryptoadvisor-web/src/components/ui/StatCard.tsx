import type { ReactNode } from 'react'
import { SkeletonBlock } from './LoadingSkeleton'
import Sparkline from '../charts/Sparkline'
import { CHART_COLORS } from '../../types/index'

interface StatCardProps {
  label: string
  value: string
  change?: string
  positive?: boolean
  changeType?: 'positive' | 'negative' | 'neutral'
  sparklineNode?: ReactNode
  sparklineData?: number[]
  isLoading?: boolean
}

export default function StatCard({
  label,
  value,
  change,
  positive,
  changeType,
  sparklineNode,
  sparklineData,
  isLoading,
}: StatCardProps) {
  // Resolve positive from changeType if not set directly
  const isPositive = positive ?? (changeType === 'positive' ? true : changeType === 'negative' ? false : undefined)

  if (isLoading) {
    return (
      <div className="bg-bg-surface border border-bg-border rounded-lg p-4">
        <SkeletonBlock height="h-3" className="w-1/2 mb-3" />
        <SkeletonBlock height="h-8" className="w-3/4 mb-2" />
        <SkeletonBlock height="h-3" className="w-1/3" />
      </div>
    )
  }

  return (
    <div className="bg-bg-surface border border-bg-border rounded-lg p-4">
      <p className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-1">{label}</p>
      <p className="text-2xl font-bold font-mono tabular-nums text-text-primary mb-1">{value}</p>
      {change && (
        <p className={`text-sm font-semibold font-mono tabular-nums ${isPositive ? 'text-positive' : isPositive === false ? 'text-negative' : 'text-text-secondary'}`}>
          {change}
        </p>
      )}
      {sparklineNode && <div className="mt-2 h-12">{sparklineNode}</div>}
      {!sparklineNode && sparklineData && sparklineData.length > 0 && (
        <div className="mt-2 h-12">
          <Sparkline
            data={sparklineData}
            height={48}
            color={
              changeType === 'positive'
                ? CHART_COLORS.positive
                : changeType === 'negative'
                ? CHART_COLORS.negative
                : CHART_COLORS.accent
            }
          />
        </div>
      )}
    </div>
  )
}
