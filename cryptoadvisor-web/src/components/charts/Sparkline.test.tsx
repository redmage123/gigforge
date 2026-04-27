import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import Sparkline from './Sparkline'

describe('Sparkline', () => {
  it('renders without crashing', () => {
    render(<Sparkline data={[1, 2, 3, 4, 5]} />)
  })

  it('renders area-chart testid', () => {
    render(<Sparkline data={[10, 20, 15, 25, 30]} />)
    expect(screen.getByTestId('responsive-container')).toBeInTheDocument()
  })

  it('renders with custom height', () => {
    render(<Sparkline data={[1, 2, 3]} height={80} />)
  })

  it('renders with empty data', () => {
    render(<Sparkline data={[]} />)
  })
})
