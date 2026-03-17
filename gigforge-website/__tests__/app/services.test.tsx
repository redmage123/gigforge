import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import Services from '@/app/services/page'

describe('Services Page', () => {
  it('renders page title', () => {
    render(<Services />)
    expect(screen.getByRole('heading', { name: /services/i, level: 1 })).toBeInTheDocument()
  })

  it('displays all 4 practice sections', () => {
    render(<Services />)
    expect(screen.getByRole('heading', { name: /programming/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /ai & automation/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /video production/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /marketing & seo/i })).toBeInTheDocument()
  })

  it('shows rate cards with pricing tiers', () => {
    render(<Services />)
    expect(screen.getAllByText(/basic/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/standard/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/premium/i).length).toBeGreaterThan(0)
  })
})
