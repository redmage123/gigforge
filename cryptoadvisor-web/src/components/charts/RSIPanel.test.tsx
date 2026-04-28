import { describe, it, expect } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import RSIPanel from "./RSIPanel"
import type { OHLCVCandle } from "../../types/index"

const sampleCandles: OHLCVCandle[] = Array.from({ length: 30 }, (_, i) => ({
  timestamp: Date.UTC(2026, 0, i + 1),
  open: 100 + Math.sin(i / 3) * 5,
  high: 105 + Math.sin(i / 3) * 5,
  low: 95 + Math.sin(i / 3) * 5,
  close: 100 + Math.sin(i / 3) * 5,
  volume: 1000,
}))

describe("RSIPanel", () => {
  it("renders with default period 14", () => {
    render(<RSIPanel candles={sampleCandles} />)
    expect(screen.getByText("RSI(14)")).toBeInTheDocument()
  })

  it("toggles period on click", () => {
    render(<RSIPanel candles={sampleCandles} />)
    const seven = screen.getByRole("button", { name: "7" })
    fireEvent.click(seven)
    expect(screen.getByText("RSI(7)")).toBeInTheDocument()
  })

  it("renders without crashing on empty candles", () => {
    render(<RSIPanel candles={[]} />)
  })
})
