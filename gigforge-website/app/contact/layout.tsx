import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Contact | GigForge',
  description: 'Get in touch with GigForge. Tell us about your project and we\'ll respond within 24 hours.',
}

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
