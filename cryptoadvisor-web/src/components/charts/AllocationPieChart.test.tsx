import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import AllocationPieChart from './AllocationPieChart'
import type { Holding } from '../../types/index'

const mockHoldings: Holding[] = [
  {
    asset: 'Bitcoin',
    symbol: 'BTC',
    amount: 1.0,
    value: 43000,
    allocationPct: 60,
    avgBuyPrice: 38000,
    currentPrice: 43000,
    pnl: 5000,
    pnlPct: 13.16,
    sparkline: [40000, 41000, 42000, 43000],
  },
  {
    asset: 'Ethereum',
    symbol: 'ETH',
    amount: 10,
    value: 32400,
    allocationPct: 40,
    avgBuyPrice: 2800,
    currentPrice: 3240,
    pnl: 4400,
    pnlPct: 15.71,
    sparkline: [3000, 3100, 3200, 3240],
  },
]

describe('AllocationPieChart', () => {
  it('renders the pie-chart testid', () => {
    render(<AllocationPieChart holdings={mockHoldings} totalValue={75400} />)
    expect(screen.getByTestId('chart')).toBeInTheDocument()
  })

  it('renders total value', () => {
    render(<AllocationPieChart holdings={mockHoldings} totalValue={75400} />)
    expect(screen.getByText(/75,400/)).toBeInTheDocument()
  })

  it('renders loading skeleton when isLoading', () => {
    render(<AllocationPieChart holdings={[]} totalValue={0} isLoading={true} />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('renders empty state when no holdings', () => {
    render(<AllocationPieChart holdings={[]} totalValue={0} />)
    expect(screen.getByText('No holdings')).toBeInTheDocument()
  })
})
