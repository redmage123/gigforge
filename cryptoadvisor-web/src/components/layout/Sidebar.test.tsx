import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import Sidebar from './Sidebar'

function renderSidebar(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Sidebar onClose={vi.fn()} />
    </MemoryRouter>
  )
}

describe('Sidebar', () => {
  it('renders without crashing', () => {
    renderSidebar()
  })

  it('renders the logo text', () => {
    renderSidebar()
    expect(screen.getByText(/CryptoAdvisor/)).toBeInTheDocument()
  })

  it('renders all navigation links', () => {
    renderSidebar()
    expect(screen.getByRole('link', { name: /Dashboard/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Portfolio/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Charts/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Signals/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Alerts/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Transactions/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Watchlist/i })).toBeInTheDocument()
  })

  it('has a nav element with aria-label', () => {
    renderSidebar()
    expect(screen.getByRole('navigation', { name: /Main navigation/i })).toBeInTheDocument()
  })
})
