import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

vi.mock("../api/index", () => ({
  getPrices: vi.fn(async (asset: string) => ({
    asset,
    timeframe: "1M",
    candles: Array.from({ length: 60 }, (_, i) => ({
      timestamp: Date.UTC(2026, 0, i + 1),
      open: 100,
      high: 105,
      low: 95,
      close: 100 + Math.sin(i / 3) * 5,
      volume: 100,
    })),
  })),
}))

import Stats from "./Stats"

function renderWithProviders(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

describe("Stats page", () => {
  beforeEach(() => vi.clearAllMocks())

  it("renders the analytics surface once data resolves", async () => {
    renderWithProviders(<Stats />)
    await waitFor(() => {
      expect(screen.getByText("Statistical Analytics")).toBeInTheDocument()
    })
    expect(screen.getByLabelText(/Asset/i)).toBeInTheDocument()
    expect(screen.getByText(/Sharpe \(annual\)/)).toBeInTheDocument()
    expect(screen.getByText(/Returns Distribution/)).toBeInTheDocument()
    expect(screen.getAllByText(/Drawdown/).length).toBeGreaterThan(0)
    expect(screen.getByText(/Correlation Matrix/)).toBeInTheDocument()
    expect(screen.getByText(/Modern Portfolio Theory/i)).toBeInTheDocument()
  })
})
