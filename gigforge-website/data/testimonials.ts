// Placeholder testimonials — sample data for portfolio demonstration
export interface Testimonial {
  name: string
  role: string
  company: string
  quote: string
  avatar?: string
}

export const testimonials: Testimonial[] = [
  {
    name: 'Sarah Chen',
    role: 'CTO',
    company: 'Nexus Labs',
    quote:
      'GigForge delivered our AI-powered data pipeline ahead of schedule. The TDD approach meant zero regressions at launch — exceptional quality throughout.',
  },
  {
    name: 'Marcus Rivera',
    role: 'Founder',
    company: 'Loop Creative',
    quote:
      'They rebuilt our entire customer portal in three weeks. Clean code, Docker-ready, and documentation so good our own team could extend it immediately.',
  },
  {
    name: 'Priya Nair',
    role: 'Head of Marketing',
    company: 'Velox Digital',
    quote:
      'The SEO and content strategy GigForge put together doubled our organic traffic in 90 days. Data-driven, methodical, and genuinely effective.',
  },
  {
    name: 'Tom Bauer',
    role: 'Product Manager',
    company: 'Stackr Inc.',
    quote:
      'From brief to delivery in under a week. The automation workflow they built saves us six hours every day — best ROI we have had on any freelance engagement.',
  },
]
