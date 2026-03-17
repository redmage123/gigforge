import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import ProjectCard from '@/components/ProjectCard'
import type { Project } from '@/data/projects'

const mockProject: Project = {
  slug: 'test-project',
  title: 'Test Project',
  shortDescription: 'A test project for verification.',
  overview: 'Full overview text here.',
  techStack: ['Node.js', 'TypeScript', 'PostgreSQL'],
  testCount: 42,
  sprintCount: 2,
  tier: 'M',
  budget: '$300',
  platform: 'Fiverr',
  highlights: ['Highlight one', 'Highlight two'],
  image: '/images/project-test.jpg',
}

describe('ProjectCard', () => {
  it('renders the project title', () => {
    render(<ProjectCard project={mockProject} />)
    expect(screen.getByText('Test Project')).toBeInTheDocument()
  })

  it('renders the project short description', () => {
    render(<ProjectCard project={mockProject} />)
    expect(screen.getByText(/a test project for verification/i)).toBeInTheDocument()
  })

  it('renders project card with image', () => {
    render(<ProjectCard project={mockProject} />)
    const img = screen.getByRole('img', { name: /test project/i })
    expect(img).toBeInTheDocument()
  })

  it('project image has descriptive alt text (not empty)', () => {
    render(<ProjectCard project={mockProject} />)
    const img = screen.getByRole('img', { name: /test project/i })
    expect(img).toHaveAttribute('alt')
    const alt = img.getAttribute('alt') ?? ''
    expect(alt.length).toBeGreaterThan(0)
    expect(alt.toLowerCase()).not.toBe('image')
  })

  it('links to the portfolio detail page', () => {
    render(<ProjectCard project={mockProject} />)
    expect(screen.getByRole('link')).toHaveAttribute('href', '/portfolio/test-project')
  })

  it('renders tech stack badges', () => {
    render(<ProjectCard project={mockProject} />)
    expect(screen.getByText('Node.js')).toBeInTheDocument()
    expect(screen.getByText('TypeScript')).toBeInTheDocument()
  })
})
