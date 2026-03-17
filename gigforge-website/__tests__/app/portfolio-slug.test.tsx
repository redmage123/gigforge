import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import ProjectDetail from '@/app/portfolio/[slug]/page'

describe('Project Detail Page', () => {
  const mockParams = { slug: 'todo-rest-api' }

  it('renders project title', async () => {
    const page = await ProjectDetail({ params: Promise.resolve(mockParams) })
    render(page)
    expect(screen.getByRole('heading', { name: /todo rest api/i, level: 1 })).toBeInTheDocument()
  })

  it('displays project overview', async () => {
    const page = await ProjectDetail({ params: Promise.resolve(mockParams) })
    render(page)
    expect(screen.getByText(/JWT authentication/i)).toBeInTheDocument()
  })

  it('shows tech stack', async () => {
    const page = await ProjectDetail({ params: Promise.resolve(mockParams) })
    render(page)
    expect(screen.getByText('Node.js')).toBeInTheDocument()
    expect(screen.getByText('TypeScript')).toBeInTheDocument()
  })

  it('displays test count and sprint count', async () => {
    const page = await ProjectDetail({ params: Promise.resolve(mockParams) })
    render(page)
    expect(screen.getByText('Tests')).toBeInTheDocument()
    expect(screen.getByText('Sprints')).toBeInTheDocument()
  })

  it('shows highlights section', async () => {
    const page = await ProjectDetail({ params: Promise.resolve(mockParams) })
    render(page)
    expect(screen.getByRole('heading', { name: /key highlights/i })).toBeInTheDocument()
    expect(screen.getByText(/JWT auth with token blacklisting/i)).toBeInTheDocument()
  })

  it('renders project image with descriptive alt text', async () => {
    const page = await ProjectDetail({ params: Promise.resolve(mockParams) })
    render(page)
    const projectImg = screen.getByRole('img', { name: /todo rest api/i })
    expect(projectImg).toBeInTheDocument()
    const alt = projectImg.getAttribute('alt') ?? ''
    expect(alt.length).toBeGreaterThan(0)
    expect(alt.toLowerCase()).not.toBe('image')
  })
})
