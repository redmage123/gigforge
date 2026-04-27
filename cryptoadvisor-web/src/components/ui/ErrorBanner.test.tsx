import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import ErrorBanner from './ErrorBanner'

describe('ErrorBanner', () => {
  it('renders without crashing', () => {
    render(<ErrorBanner />)
  })

  it('renders default message', () => {
    render(<ErrorBanner />)
    expect(screen.getByText(/Failed to load data/i)).toBeInTheDocument()
  })

  it('renders custom message', () => {
    render(<ErrorBanner message="Something went wrong!" />)
    expect(screen.getByText('Something went wrong!')).toBeInTheDocument()
  })

  it('has role alert', () => {
    render(<ErrorBanner />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })
})
