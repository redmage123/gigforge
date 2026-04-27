import { describe, it, expect } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Routes, Route } from 'react-router'
import { createElement } from 'react'
import Dashboard from './Dashboard'

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return createElement(
    QueryClientProvider,
    { client: qc },
    createElement(MemoryRouter, { initialEntries: ['/'] },
      createElement(Routes, null,
        createElement(Route, { path: '/', element: children })
      )
    )
  )
}

describe('Dashboard', () => {
  it('renders without crashing', () => {
    render(<Dashboard />, { wrapper })
  })

  it('shows panel headings', async () => {
    render(<Dashboard />, { wrapper })
    await waitFor(() => {
      expect(screen.getByText('Portfolio Allocation')).toBeInTheDocument()
    })
    expect(screen.getByText('Price Chart')).toBeInTheDocument()
    expect(screen.getByText('AI Signals')).toBeInTheDocument()
    expect(screen.getByText('Watchlist')).toBeInTheDocument()
    expect(screen.getByText('Alerts')).toBeInTheDocument()
    expect(screen.getByText('Recent Transactions')).toBeInTheDocument()
  })

  it('shows link to all transactions', async () => {
    render(<Dashboard />, { wrapper })
    await waitFor(() => {
      expect(screen.getByText(/View all transactions/i)).toBeInTheDocument()
    })
  })
})
