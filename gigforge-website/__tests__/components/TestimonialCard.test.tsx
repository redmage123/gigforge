import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import TestimonialCard from '@/components/TestimonialCard'

const mockTestimonial = {
  name: 'Sarah Chen',
  role: 'CTO',
  company: 'Nexus Labs',
  quote: 'GigForge delivered our AI pipeline ahead of schedule. Exceptional quality.',
}

describe('TestimonialCard', () => {
  it('renders the client name', () => {
    render(<TestimonialCard testimonial={mockTestimonial} />)
    expect(screen.getByText('Sarah Chen')).toBeInTheDocument()
  })

  it('renders the client role', () => {
    render(<TestimonialCard testimonial={mockTestimonial} />)
    expect(screen.getByText(/cto/i)).toBeInTheDocument()
  })

  it('renders the company name', () => {
    render(<TestimonialCard testimonial={mockTestimonial} />)
    expect(screen.getByText(/nexus labs/i)).toBeInTheDocument()
  })

  it('renders the testimonial quote', () => {
    render(<TestimonialCard testimonial={mockTestimonial} />)
    expect(screen.getByText(/delivered our ai pipeline/i)).toBeInTheDocument()
  })

  it('has a blockquote or quote container element', () => {
    render(<TestimonialCard testimonial={mockTestimonial} />)
    expect(screen.getByRole('blockquote', { hidden: true }) ?? document.querySelector('blockquote')).toBeTruthy()
  })

  it('renders initials avatar with correct initials', () => {
    render(<TestimonialCard testimonial={mockTestimonial} />)
    // Sarah Chen → initials "SC"
    expect(screen.getByText('SC')).toBeInTheDocument()
  })

  it('avatar is present in the card', () => {
    render(<TestimonialCard testimonial={mockTestimonial} />)
    const initialsEl = screen.getByText('SC')
    expect(initialsEl).toBeInTheDocument()
  })
})
