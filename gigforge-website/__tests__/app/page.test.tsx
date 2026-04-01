import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import HomePage from '@/app/page'

describe('GigForge HomePage', () => {
  it('renders H1 heading', () => {
    render(<HomePage />)
    const h1 = screen.getByRole('heading', { level: 1 })
    expect(h1).toBeInTheDocument()
  })

  it('renders Request a Demo CTA', () => {
    render(<HomePage />)
    const links = screen.getAllByRole('link', { name: /request a demo/i })
    expect(links.length).toBeGreaterThan(0)
  })

  it('renders services section', () => {
    render(<HomePage />)
    expect(screen.getByText('Full-Stack Web Apps')).toBeInTheDocument()
  })

  it('renders View Our Work portfolio section', () => {
    render(<HomePage />)
    expect(screen.getByText('Projects delivered by our AI team')).toBeInTheDocument()
  })
})
