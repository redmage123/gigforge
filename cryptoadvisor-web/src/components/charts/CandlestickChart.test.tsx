import { describe, it, expect } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'
import CandlestickChart from './CandlestickChart'

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return createElement(QueryClientProvider, { client: qc }, children)
}

describe('CandlestickChart', () => {
  it('renders without crashing', () => {
    render(<CandlestickChart />, { wrapper })
  })

  it('shows timeframe buttons after data loads', async () => {
    render(<CandlestickChart />, { wrapper })
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /1D/i })).toBeInTheDocument()
    }, { timeout: 1000 })
    expect(screen.getByRole('button', { name: /1W/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /1M/i })).toBeInTheDocument()
  })

  it('shows asset selector after data loads', async () => {
    render(<CandlestickChart />, { wrapper })
    await waitFor(() => {
      expect(screen.getByLabelText('Select asset')).toBeInTheDocument()
    }, { timeout: 1000 })
  })

  it('1D timeframe button is active by default', async () => {
    render(<CandlestickChart defaultTimeframe="1D" />, { wrapper })
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '1D' })).toBeInTheDocument()
    }, { timeout: 1000 })
    const btn = screen.getByRole('button', { name: '1D' })
    expect(btn).toHaveAttribute('aria-pressed', 'true')
  })

  it('switches timeframe when 1W button is clicked', async () => {
    render(<CandlestickChart />, { wrapper })
    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '1W' })).toBeInTheDocument()
    }, { timeout: 1000 })
    fireEvent.click(screen.getByRole('button', { name: '1W' }))
    // After click the component reloads data; wait for buttons to reappear
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '1W' })).toBeInTheDocument()
    }, { timeout: 1000 })
    expect(screen.getByRole('button', { name: '1W' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '1D' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('switches asset via select', async () => {
    render(<CandlestickChart />, { wrapper })
    await waitFor(() => {
      expect(screen.getByLabelText('Select asset')).toBeInTheDocument()
    }, { timeout: 1000 })
    const select = screen.getByLabelText('Select asset')
    fireEvent.change(select, { target: { value: 'ETH' } })
    expect((select as HTMLSelectElement).value).toBe('ETH')
  })

  it('shows all four asset options', async () => {
    render(<CandlestickChart />, { wrapper })
    await waitFor(() => {
      expect(screen.getByLabelText('Select asset')).toBeInTheDocument()
    }, { timeout: 1000 })
    expect(screen.getByRole('option', { name: 'BTC' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'ETH' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'SOL' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'ADA' })).toBeInTheDocument()
  })
})
