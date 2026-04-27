import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import StatCard from './StatCard'

describe('StatCard', () => {
  it('renders the label', () => {
    render(<StatCard label="Total Value" value="$124,350.78" />)
    expect(screen.getByText('Total Value')).toBeInTheDocument()
  })

  it('renders the value', () => {
    render(<StatCard label="Total Value" value="$124,350.78" />)
    expect(screen.getByText('$124,350.78')).toBeInTheDocument()
  })

  it('renders change when provided', () => {
    render(<StatCard label="24h Change" value="+$2,847.32" change="+2.34%" changeType="positive" />)
    expect(screen.getByText('+2.34%')).toBeInTheDocument()
  })

  it('applies positive color class for positive changeType', () => {
    render(<StatCard label="test" value="$100" change="+5%" changeType="positive" />)
    const badge = screen.getByText('+5%')
    expect(badge).toHaveClass('text-positive')
  })

  it('applies negative color class for negative changeType', () => {
    render(<StatCard label="test" value="$100" change="-5%" changeType="negative" />)
    const badge = screen.getByText('-5%')
    expect(badge).toHaveClass('text-negative')
  })

  it('renders without change or sparkline', () => {
    render(<StatCard label="Label" value="Value" />)
    expect(screen.getByText('Label')).toBeInTheDocument()
    expect(screen.getByText('Value')).toBeInTheDocument()
  })

  it('renders loading skeleton when isLoading is true', () => {
    const { container } = render(<StatCard label="Total Value" value="$124,350.78" isLoading={true} />)
    // Value should not be displayed while loading
    expect(screen.queryByText('$124,350.78')).not.toBeInTheDocument()
    // Skeleton elements present
    expect(container.querySelector('.animate-pulse')).toBeTruthy()
  })

  it('renders sparkline when sparklineData is provided', () => {
    render(
      <StatCard
        label="Total Value"
        value="$124,350.78"
        sparklineData={[110000, 115000, 120000, 124350]}
        changeType="positive"
      />
    )
    // Recharts ResponsiveContainer is mocked with data-testid="responsive-container"
    expect(screen.getByTestId('responsive-container')).toBeInTheDocument()
  })

  it('does not render sparkline when sparklineData is empty', () => {
    render(<StatCard label="Total Value" value="$124,350.78" sparklineData={[]} />)
    expect(screen.queryByTestId('responsive-container')).not.toBeInTheDocument()
  })
})
