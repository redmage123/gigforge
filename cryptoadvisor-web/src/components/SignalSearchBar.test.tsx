import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import SignalSearchBar from './SignalSearchBar'

function renderBar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <SignalSearchBar />
    </QueryClientProvider>,
  )
}

describe('SignalSearchBar', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test('renders search input + filters', () => {
    renderBar()
    expect(screen.getByLabelText('Search signals')).toBeInTheDocument()
    expect(screen.getByLabelText('Filter by direction')).toBeInTheDocument()
    expect(screen.getByLabelText('Minimum confidence')).toBeInTheDocument()
  })

  test('does not fetch on empty query', () => {
    renderBar()
    expect(fetch).not.toHaveBeenCalled()
  })

  test('renders search results from CMS', async () => {
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        query: 'bitcoin',
        direction: null,
        minConfidence: 0,
        results: [
          {
            id: '1',
            assetSymbol: 'BTC',
            assetName: 'Bitcoin',
            direction: 'BUY',
            confidence: 82,
            reason: 'On-chain accumulation',
            generatedAt: '2026-03-23T00:00:00Z',
            score: 3.5,
            matchedFields: ['assetSymbol', 'assetName'],
          },
        ],
        count: 1,
      }),
    } as Response)

    renderBar()
    fireEvent.change(screen.getByLabelText('Search signals'), { target: { value: 'bitcoin' } })

    await waitFor(() => expect(screen.getByTestId('search-results')).toBeInTheDocument())
    expect(screen.getByText('On-chain accumulation')).toBeInTheDocument()
    expect(screen.getByText(/matched: assetSymbol, assetName/)).toBeInTheDocument()
  })

  test('renders empty-results message', async () => {
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        query: 'nomatch',
        direction: null,
        minConfidence: 0,
        results: [],
        count: 0,
      }),
    } as Response)

    renderBar()
    fireEvent.change(screen.getByLabelText('Search signals'), { target: { value: 'nomatch' } })

    await waitFor(() => expect(screen.getByTestId('search-empty')).toBeInTheDocument())
  })
})
