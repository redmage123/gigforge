import { describe, it, expect } from 'vitest'
import { testimonials } from '@/data/testimonials'

describe('testimonials data', () => {
  it('exports an array with 3 or 4 testimonials', () => {
    expect(testimonials.length).toBeGreaterThanOrEqual(3)
    expect(testimonials.length).toBeLessThanOrEqual(4)
  })

  it('each testimonial has required fields', () => {
    for (const t of testimonials) {
      expect(t.name).toBeTruthy()
      expect(t.role).toBeTruthy()
      expect(t.company).toBeTruthy()
      expect(t.quote).toBeTruthy()
    }
  })

  it('all quotes are meaningful strings (>20 chars)', () => {
    for (const t of testimonials) {
      expect(t.quote.length).toBeGreaterThan(20)
    }
  })
})
