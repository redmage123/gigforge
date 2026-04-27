import type { ReactNode } from 'react'

type BadgeVariant =
  | 'BUY' | 'SELL' | 'HOLD'
  | 'buy' | 'sell' | 'hold'
  | 'completed' | 'pending' | 'failed'
  | 'active' | 'triggered'

interface BadgeProps {
  variant: BadgeVariant
  label?: string
  children?: ReactNode
  className?: string
}

const VARIANT_STYLES: Record<BadgeVariant, string> = {
  BUY:       'bg-positive/20 text-positive border border-positive/20',
  buy:       'bg-positive/20 text-positive border border-positive/20',
  SELL:      'bg-negative/20 text-negative border border-negative/20',
  sell:      'bg-negative/20 text-negative border border-negative/20',
  HOLD:      'bg-neutral/20 text-neutral border border-neutral/20',
  hold:      'bg-neutral/20 text-neutral border border-neutral/20',
  completed: 'bg-positive/20 text-positive border border-positive/20',
  pending:   'bg-neutral/20 text-neutral border border-neutral/20',
  failed:    'bg-negative/20 text-negative border border-negative/20',
  active:    'bg-positive/20 text-positive border border-positive/20',
  triggered: 'bg-negative/20 text-negative border border-negative/20',
}

export default function Badge({ variant, label, children, className = '' }: BadgeProps) {
  const content = children ?? label ?? variant.toUpperCase()
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wider ${VARIANT_STYLES[variant] ?? ''} ${className}`}>
      {content}
    </span>
  )
}
