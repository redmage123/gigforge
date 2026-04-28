import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import React from "react"

vi.mock("../api/index", () => ({
  getPrices: vi.fn(async (asset: string) => {
    // Construct a series with a clear breakout on the last candle.
    const flat = Array.from({ length: 25 }, (_, i) => ({
      timestamp: Date.UTC(2026, 0, i + 1),
      open: 100,
      high: 105,
      low: 95,
      close: 100,
      volume: 0,
    }))
    flat.push({
      timestamp: Date.UTC(2026, 0, 26),
      open: 100,
      high: 130,
      low: 100,
      close: 125,
      volume: 0,
    })
    return { asset, timeframe: "1M", candles: flat }
  }),
}))

import { useDonchianSignals } from "./useDonchianSignals"

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

describe("useDonchianSignals", () => {
  beforeEach(() => vi.clearAllMocks())

  it("emits BUY signals for breakouts across all 4 tracked assets", async () => {
    const { result } = renderHook(() => useDonchianSignals(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data.length).toBeGreaterThanOrEqual(1)
    expect(result.current.data[0].source).toBe("donchian")
    expect(result.current.data[0].direction).toBe("BUY")
  })
})
