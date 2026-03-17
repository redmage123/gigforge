import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import Portfolio from '@/app/portfolio/page'

describe('Portfolio Page', () => {
  it('renders page title', () => {
    render(<Portfolio />)
    expect(screen.getByRole('heading', { name: /portfolio/i, level: 1 })).toBeInTheDocument()
  })

  it('displays all 5 project cards', () => {
    render(<Portfolio />)
    const projectCards = screen.getAllByTestId('project-card')
    expect(projectCards).toHaveLength(5)
  })

  it('shows project titles', () => {
    render(<Portfolio />)
    expect(screen.getByText('Todo REST API')).toBeInTheDocument()
    expect(screen.getByText('SaaS Billing Microservice')).toBeInTheDocument()
    expect(screen.getByText('AI Chat Widget (RAG)')).toBeInTheDocument()
  })

  it('has accessible heading hierarchy', () => {
    render(<Portfolio />)
    const h1 = screen.getByRole('heading', { level: 1 })
    expect(h1).toBeInTheDocument()
  })
})
