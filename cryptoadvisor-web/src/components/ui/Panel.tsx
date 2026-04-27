import type { ReactNode } from 'react'

interface PanelProps {
  title?: string
  children: ReactNode
  action?: ReactNode
  className?: string
}

export default function Panel({ title, children, action, className = '' }: PanelProps) {
  return (
    <div className={`bg-bg-surface border border-bg-border rounded-lg overflow-hidden ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between px-4 py-3 border-b border-bg-border">
          {title && <h2 className="text-sm font-semibold text-text-primary">{title}</h2>}
          {action && <div className="text-text-secondary">{action}</div>}
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  )
}
