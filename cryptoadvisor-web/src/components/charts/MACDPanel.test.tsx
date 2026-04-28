import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import MACDPanel from "./MACDPanel"
import type { OHLCVCandle } from "../../types/index"

const sampleCandles: OHLCVCandle[] = Array.from({ length: 60 }, (_, i) => ({
  timestamp: Date.UTC(2026, 0, i + 1),
  open: 100 + Math.sin(i / 5) * 5,
  high: 105,
  low: 95,
  close: 100 + Math.sin(i / 5) * 5,
  volume: 1000,
}))

describe("MACDPanel", () => {
  it("renders default header (12, 26, 9)", () => {
    render(<MACDPanel candles={sampleCandles} />)
    expect(screen.getByText("MACD(12, 26, 9)")).toBeInTheDocument()
  })

  it("accepts custom periods", () => {
    render(<MACDPanel candles={sampleCandles} fast={5} slow={20} signalPeriod={3} />)
    expect(screen.getByText("MACD(5, 20, 3)")).toBeInTheDocument()
  })
})
