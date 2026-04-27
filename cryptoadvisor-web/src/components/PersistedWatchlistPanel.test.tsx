import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import PersistedWatchlistPanel from './PersistedWatchlistPanel'

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <PersistedWatchlistPanel />
    </QueryClientProvider>,
  )
}

describe('PersistedWatchlistPanel', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test('renders empty state when CMS returns no items', async () => {
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ docs: [], totalDocs: 0 }),
    } as Response)

    renderPanel()
    await waitFor(() =>
      expect(screen.getByTestId('persisted-watchlist-empty')).toBeInTheDocument(),
    )
  })

  test('renders watchlist items from CMS', async () => {
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        docs: [
          { id: 'wl-1', userId: 'demo-user', symbol: 'BTC', name: 'Bitcoin', addedAt: '2026-04-28T00:00:00Z' },
          { id: 'wl-2', userId: 'demo-user', symbol: 'ETH', name: 'Ethereum', addedAt: '2026-04-28T00:00:00Z' },
        ],
        totalDocs: 2,
      }),
    } as Response)

    renderPanel()
    await waitFor(() =>
      expect(screen.getByTestId('persisted-watchlist-list')).toBeInTheDocument(),
    )
    expect(screen.getByText('BTC')).toBeInTheDocument()
    expect(screen.getByText('ETH')).toBeInTheDocument()
  })

  test('add form posts to CMS', async () => {
    ;(fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ docs: [], totalDocs: 0 }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'wl-3', userId: 'demo-user', symbol: 'SOL', name: 'Solana', addedAt: '2026-04-28T00:00:00Z',
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ docs: [], totalDocs: 0 }),
      } as Response)

    renderPanel()
    await waitFor(() => screen.getByTestId('persisted-watchlist-empty'))

    fireEvent.change(screen.getByLabelText('Asset symbol'), { target: { value: 'SOL' } })
    fireEvent.change(screen.getByLabelText('Asset name'), { target: { value: 'Solana' } })
    fireEvent.click(screen.getByText('Add'))

    await waitFor(() => {
      const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls
      const postCall = calls.find((c) => (c[1] as RequestInit | undefined)?.method === 'POST')
      expect(postCall).toBeTruthy()
    })
  })
})
