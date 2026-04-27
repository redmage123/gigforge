import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import Badge from './Badge'

describe('Badge', () => {
  it('renders BUY badge with green styling', () => {
    render(<Badge variant="buy">BUY</Badge>)
    const badge = screen.getByText('BUY')
    expect(badge).toBeInTheDocument()
    expect(badge).toHaveClass('text-positive')
  })

  it('renders SELL badge with red styling', () => {
    render(<Badge variant="sell">SELL</Badge>)
    const badge = screen.getByText('SELL')
    expect(badge).toBeInTheDocument()
    expect(badge).toHaveClass('text-negative')
  })

  it('renders HOLD badge with amber styling', () => {
    render(<Badge variant="hold">HOLD</Badge>)
    const badge = screen.getByText('HOLD')
    expect(badge).toBeInTheDocument()
    expect(badge).toHaveClass('text-neutral')
  })

  it('renders triggered badge', () => {
    render(<Badge variant="triggered">TRIGGERED</Badge>)
    expect(screen.getByText('TRIGGERED')).toBeInTheDocument()
  })

  it('renders completed badge', () => {
    render(<Badge variant="completed">COMPLETED</Badge>)
    expect(screen.getByText('COMPLETED')).toBeInTheDocument()
  })

  it('renders pending badge', () => {
    render(<Badge variant="pending">PENDING</Badge>)
    expect(screen.getByText('PENDING')).toBeInTheDocument()
  })
})
