export interface Testimonial {
  name: string
  role: string
  company: string
  quote: string
  avatar?: string
}

// Real client testimonials only — no fabricated names, roles, or quotes.
// Leave this array empty until verified testimonials are collected from actual clients.
export const testimonials: Testimonial[] = []
