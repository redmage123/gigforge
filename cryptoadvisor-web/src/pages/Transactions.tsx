import { useState } from 'react'
import { useTransactions } from '../hooks/useTransactions'
import Panel from '../components/ui/Panel'
import CsvDownloadButton from '../components/CsvDownloadButton'
import Badge from '../components/ui/Badge'
import LoadingSkeleton from '../components/ui/LoadingSkeleton'
import ErrorBanner from '../components/ui/ErrorBanner'
import type { Transaction } from '../types/index'

type SortKey = keyof Pick<Transaction, 'date' | 'asset' | 'type' | 'amount' | 'price' | 'total' | 'status'>
type SortDir = 'asc' | 'desc'

function formatUSD(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`
}

interface SortableHeaderProps {
  label: string
  sortKey: SortKey
  currentSort: SortKey
  currentDir: SortDir
  onSort: (key: SortKey) => void
  align?: 'left' | 'right'
}

function SortableHeader({
  label,
  sortKey,
  currentSort,
  currentDir,
  onSort,
  align = 'left',
}: SortableHeaderProps) {
  const isActive = currentSort === sortKey
  return (
    <th
      className={`px-3 py-2 font-medium text-text-muted text-xs uppercase tracking-wide cursor-pointer hover:text-text-secondary select-none ${
        align === 'right' ? 'text-right' : 'text-left'
      }`}
    >
      <button
        onClick={() => onSort(sortKey)}
        className="flex items-center gap-1 focus:outline-none focus:ring-2 focus:ring-accent rounded"
        style={align === 'right' ? { marginLeft: 'auto' } : undefined}
        aria-label={`Sort by ${label}`}
      >
        {label}
        <span aria-hidden="true" className="text-text-muted">
          {isActive ? (currentDir === 'asc' ? '↑' : '↓') : '↕'}
        </span>
      </button>
    </th>
  )
}

export default function Transactions() {
  const { data, isLoading, isError } = useTransactions()
  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const sorted = data
    ? [...data].sort((a, b) => {
        const av = a[sortKey]
        const bv = b[sortKey]
        const cmp = typeof av === 'number' && typeof bv === 'number'
          ? av - bv
          : String(av).localeCompare(String(bv))
        return sortDir === 'asc' ? cmp : -cmp
      })
    : []

  return (
    <div className="space-y-4">
      <Panel title="Transaction History">
        {isLoading ? (
          <LoadingSkeleton rows={8} />
        ) : isError ? (
          <ErrorBanner />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead className="bg-bg-elevated">
                <tr className="border-b border-bg-border">
                  <SortableHeader label="Date" sortKey="date" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                  <SortableHeader label="Asset" sortKey="asset" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                  <SortableHeader label="Type" sortKey="type" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                  <SortableHeader label="Amount" sortKey="amount" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />
                  <SortableHeader label="Price" sortKey="price" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />
                  <SortableHeader label="Total" sortKey="total" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />
                  <SortableHeader label="Status" sortKey="status" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                </tr>
              </thead>
              <tbody>
                {sorted.map((tx, idx) => (
                  <tr
                    key={tx.id}
                    className={`border-b border-bg-border last:border-0 hover:bg-bg-elevated/70 transition-colors ${
                      idx % 2 === 0 ? '' : 'bg-bg-elevated/30'
                    }`}
                  >
                    <td className="px-3 py-2.5 font-mono tabular-nums text-text-secondary text-xs whitespace-nowrap">
                      {formatDate(tx.date)}
                    </td>
                    <td className="px-3 py-2.5">
                      <div>
                        <span className="font-mono font-semibold text-text-primary">{tx.symbol}</span>
                        <span className="text-text-muted text-xs ml-1">{tx.asset}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge variant={tx.type.toLowerCase() as 'buy' | 'sell'}>{tx.type}</Badge>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums text-text-primary">
                      {tx.amount.toLocaleString('en-US', { maximumFractionDigits: 6 })}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums text-text-secondary">
                      {formatUSD(tx.price)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums text-text-primary font-semibold">
                      {formatUSD(tx.total)}
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge variant={tx.status as 'completed' | 'pending' | 'failed'}>
                        {tx.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  )
}
