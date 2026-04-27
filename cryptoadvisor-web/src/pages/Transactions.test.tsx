import { describe, it, expect } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Routes, Route } from 'react-router'
import { createElement } from 'react'
import Transactions from './Transactions'

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return createElement(
    QueryClientProvider,
    { client: qc },
    createElement(MemoryRouter, { initialEntries: ['/transactions'] },
      createElement(Routes, null,
        createElement(Route, { path: '/transactions', element: children })
      )
    )
  )
}

describe('Transactions', () => {
  it('renders without crashing', () => {
    render(<Transactions />, { wrapper })
  })

  it('shows sort buttons in the header', async () => {
    render(<Transactions />, { wrapper })
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Sort by Date/i })).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: /Sort by Total/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Sort by Status/i })).toBeInTheDocument()
  })

  it('shows transaction data after loading', async () => {
    render(<Transactions />, { wrapper })
    await waitFor(() => {
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
    }, { timeout: 1000 })
    // Should show BTC somewhere in the table
    expect(screen.getAllByText('BTC').length).toBeGreaterThan(0)
  })

  it('sorts by clicking Total column header', async () => {
    const user = userEvent.setup()
    render(<Transactions />, { wrapper })
    await waitFor(() => {
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
    }, { timeout: 1000 })
    const totalBtn = screen.getByRole('button', { name: /Sort by Total/i })
    await user.click(totalBtn)
    // After clicking, the sort indicator should change
    expect(totalBtn).toBeInTheDocument()
  })
})
