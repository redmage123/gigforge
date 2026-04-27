import type { ReactNode } from 'react'

interface EmptyStateProps {
  message?: string
  title?: string
  description?: string
  icon?: ReactNode
}

export default function EmptyState({
  message,
  title,
  description = 'Data will appear here when available.',
  icon,
}: EmptyStateProps) {
  const heading = title ?? message ?? 'No data yet'
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="text-4xl mb-3 text-text-muted" aria-hidden="true">{icon ?? '📭'}</div>
      <p className="text-sm font-medium text-text-secondary">{heading}</p>
      <p className="text-xs text-text-muted mt-1">{description}</p>
    </div>
  )
}
