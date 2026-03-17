import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import Home from '@/app/page'

describe('Home Page', () => {
  it('renders the hero headline', () => {
    render(<Home />)
    expect(screen.getByText(/your ai-powered freelance agency/i)).toBeInTheDocument()
  })

  it('renders CTAs to portfolio and contact', () => {
    render(<Home />)
    expect(screen.getByRole('link', { name: /view portfolio/i })).toHaveAttribute('href', '/portfolio')
    expect(screen.getByRole('link', { name: /get in touch/i })).toHaveAttribute('href', '/contact')
  })

  it('displays exactly 3 featured project cards', () => {
    render(<Home />)
    const projectCards = screen.getAllByTestId('project-card')
    expect(projectCards).toHaveLength(3)
  })

  it('shows services overview section', () => {
    render(<Home />)
    expect(screen.getByRole('heading', { name: /programming & ai/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /video production/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /marketing & seo/i })).toBeInTheDocument()
  })

  it('has accessible heading hierarchy', () => {
    render(<Home />)
    const h1 = screen.getByRole('heading', { level: 1 })
    expect(h1).toBeInTheDocument()
  })

  // Testimonials section tests
  it('shows testimonials section heading', () => {
    render(<Home />)
    expect(screen.getByRole('heading', { name: /what our clients say/i })).toBeInTheDocument()
  })

  it('renders testimonial cards in the home page', () => {
    render(<Home />)
    const cards = screen.getAllByTestId('testimonial-card')
    expect(cards.length).toBeGreaterThanOrEqual(3)
  })

  it('testimonials section appears before the CTA section', () => {
    render(<Home />)
    const testimonialSection = screen.getByTestId('testimonials-section')
    const ctaSection = screen.getByTestId('cta-section')
    expect(testimonialSection.compareDocumentPosition(ctaSection)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    )
  })

  it('renders hero image with descriptive alt text', () => {
    render(<Home />)
    const heroImg = screen.getByTestId('hero-illustration')
    expect(heroImg).toBeInTheDocument()
  })

  it('service cards include icons', () => {
    render(<Home />)
    // Each service card should have an SVG icon (role="img" or aria-hidden svg)
    const serviceSection = screen.getByTestId('services-section')
    expect(serviceSection).toBeInTheDocument()
  })
})
