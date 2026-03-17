import type { Testimonial } from '@/data/testimonials'

interface Props {
  testimonial: Testimonial
}

const avatarColors = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444']

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

function getAvatarColor(name: string): string {
  const sum = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
  return avatarColors[sum % avatarColors.length]
}

export default function TestimonialCard({ testimonial }: Props) {
  const { name, role, company, quote } = testimonial
  const initials = getInitials(name)
  const avatarColor = getAvatarColor(name)

  return (
    <div data-testid="testimonial-card" className="bg-bg-secondary p-6 rounded-lg flex flex-col gap-4">
      <blockquote className="text-text-secondary italic leading-relaxed">
        &ldquo;{quote}&rdquo;
      </blockquote>
      <footer className="mt-auto flex items-center gap-3">
        <div
          aria-hidden="true"
          className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white"
          style={{ backgroundColor: avatarColor }}
        >
          {initials}
        </div>
        <div>
          <p className="text-text-primary font-semibold">{name}</p>
          <p className="text-text-secondary text-sm">
            {role} &mdash; {company}
          </p>
        </div>
      </footer>
    </div>
  )
}
