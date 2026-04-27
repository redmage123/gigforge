import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import AssetDetailModal from './AssetDetailModal'

function renderModal(symbol: string | null, onClose = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <AssetDetailModal symbol={symbol} onClose={onClose} />
    </QueryClientProvider>,
  )
}

describe('AssetDetailModal', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test('renders nothing when symbol is null', () => {
    renderModal(null)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  test('shows loading state while fetch is pending', () => {
    ;(fetch as ReturnType<typeof vi.fn>).mockImplementation(() => new Promise(() => {}))
    renderModal('BTC')
    expect(screen.getByTestId('asset-loading')).toHaveTextContent('Loading BTC')
  })

  test('renders asset detail with signalsSummary', async () => {
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        id: '1',
        name: 'Bitcoin',
        symbol: 'BTC',
        description: 'The original.',
        riskTier: 'low',
        marketCapTier: 'large',
        chain: 'Bitcoin',
        exchanges: [{ name: 'Binance' }, { name: 'Coinbase' }],
        isActive: true,
        signalsSummary: { total: 3, BUY: 2, SELL: 0, HOLD: 1 },
      }),
    } as Response)

    renderModal('BTC')
    await waitFor(() => expect(screen.getByTestId('asset-detail')).toBeInTheDocument())
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Bitcoin')
    expect(screen.getByText('Binance')).toBeInTheDocument()
    expect(screen.getByText('Coinbase')).toBeInTheDocument()
  })

  test('renders error on 404', async () => {
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: { message: 'Asset not found: ZZZ' } }),
    } as Response)

    renderModal('ZZZ')
    await waitFor(() => expect(screen.getByTestId('asset-error')).toBeInTheDocument())
  })

  test('Escape key triggers onClose', async () => {
    const onClose = vi.fn()
    ;(fetch as ReturnType<typeof vi.fn>).mockImplementation(() => new Promise(() => {}))
    renderModal('BTC', onClose)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})
