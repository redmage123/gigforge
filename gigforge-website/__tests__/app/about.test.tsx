import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import About from '@/app/about/page'

describe('About Page', () => {
  it('renders page title', () => {
    render(<About />)
    expect(screen.getByRole('heading', { name: /about/i, level: 1 })).toBeInTheDocument()
  })

  it('displays methodology section', () => {
    render(<About />)
    expect(screen.getByRole('heading', { name: /agile\/scrum/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /TDD/i })).toBeInTheDocument()
  })

  it('shows quality gate information', () => {
    render(<About />)
    expect(screen.getByRole('heading', { name: /quality reviewer/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /acceptance tester/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /client advocate/i })).toBeInTheDocument()
  })

  it('renders methodology illustration', () => {
    render(<About />)
    const illustration = screen.getByTestId('methodology-illustration')
    expect(illustration).toBeInTheDocument()
  })
})
