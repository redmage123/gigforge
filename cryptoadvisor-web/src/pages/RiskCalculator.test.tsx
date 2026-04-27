import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import RiskCalculator from './RiskCalculator'

function renderWithQuery(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

describe('RiskCalculator page', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test('renders default 3-row form summing to 100%', () => {
    renderWithQuery(<RiskCalculator />)
    expect(screen.getByTestId('risk-form')).toBeInTheDocument()
    expect(screen.getByText(/Total: 100\.0%/)).toBeInTheDocument()
  })

  test('shows warning when total != 100', () => {
    renderWithQuery(<RiskCalculator />)
    const inputs = screen.getAllByLabelText(/Percent row/)
    fireEvent.change(inputs[0], { target: { value: '40' } })
    expect(screen.getByText(/must equal 100/)).toBeInTheDocument()
  })

  test('add + remove rows', () => {
    renderWithQuery(<RiskCalculator />)
    const initialCount = screen.getAllByLabelText(/Percent row/).length
    fireEvent.click(screen.getByText('+ Add asset'))
    expect(screen.getAllByLabelText(/Percent row/).length).toBe(initialCount + 1)
  })

  test('submits and renders risk analysis', async () => {
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        currency: 'USD',
        allocations: [
          { symbol: 'BTC', pct: 50 },
          { symbol: 'ETH', pct: 30 },
          { symbol: 'USD', pct: 20 },
        ],
        hhi: 0.38,
        diversificationScore: 62,
        riskTier: 'medium',
        largestPosition: { symbol: 'BTC', pct: 50 },
        assetCount: 3,
        breakdown: 'HHI of 0.3800 indicates moderate concentration. BTC represents 50%.',
      }),
    } as Response)

    renderWithQuery(<RiskCalculator />)
    fireEvent.click(screen.getByText('Calculate risk'))

    await waitFor(() => expect(screen.getByTestId('risk-tier')).toHaveTextContent('medium'))
    expect(screen.getByText(/HHI of 0\.3800/)).toBeInTheDocument()
  })
})
