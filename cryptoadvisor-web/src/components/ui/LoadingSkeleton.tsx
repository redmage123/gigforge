interface LoadingSkeletonProps {
  rows?: number
  height?: string
  className?: string
}

export function SkeletonBlock({ height = 'h-4', className = '' }: { height?: string; className?: string }) {
  return (
    <div className={`bg-bg-elevated rounded animate-pulse ${height} ${className}`} />
  )
}

export default function LoadingSkeleton({ rows = 3, className = '' }: LoadingSkeletonProps) {
  return (
    <div className={`space-y-3 ${className}`} role="status" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonBlock key={i} height={i === 0 ? 'h-6' : 'h-4'} className={i === 0 ? 'w-1/2' : 'w-full'} />
      ))}
    </div>
  )
}

export function ChartSkeleton() {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Loading">
      <SkeletonBlock height="h-8" className="w-40" />
      <SkeletonBlock height="h-64" className="w-full" />
      <SkeletonBlock height="h-16" className="w-full" />
    </div>
  )
}

export function StatCardSkeleton() {
  return (
    <div className="bg-bg-surface border border-bg-border rounded-lg p-4 space-y-3" aria-busy="true" aria-label="Loading">
      <SkeletonBlock height="h-3" className="w-20" />
      <SkeletonBlock height="h-8" className="w-36" />
      <SkeletonBlock height="h-3" className="w-16" />
    </div>
  )
}
