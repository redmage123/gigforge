import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import VolatilityCards from "./VolatilityCards"
import type { OHLCVCandle } from "../../types/index"

const candles: OHLCVCandle[] = Array.from({ length: 60 }, (_, i) => ({
  timestamp: Date.UTC(2026, 0, i + 1),
  open: 100,
  high: 105,
  low: 95,
  close: 100 + Math.sin(i / 3) * 5,
  volume: 0,
}))

describe("VolatilityCards", () => {
  it("renders ATR and realized vol cards", () => {
    render(<VolatilityCards candles={candles} />)
    expect(screen.getByText("ATR (14)")).toBeInTheDocument()
    expect(screen.getByText("Realized Vol (30d, ann.)")).toBeInTheDocument()
  })

  it("renders em-dash when candle history is too short", () => {
    render(<VolatilityCards candles={candles.slice(0, 5)} />)
    const dashes = screen.getAllByText("—")
    expect(dashes.length).toBe(2)
  })
})
