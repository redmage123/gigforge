import { describe, it, expect } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { renderHook, act } from "@testing-library/react"
import {
  IndicatorBanners,
  OverlayToggleBar,
  useIndicatorOverlays,
} from "./IndicatorOverlays"
import type { OHLCVCandle } from "../../types/index"

const candles: OHLCVCandle[] = Array.from({ length: 220 }, (_, i) => ({
  timestamp: Date.UTC(2026, 0, i + 1),
  open: 100 + i * 0.1,
  high: 102 + i * 0.1,
  low: 98 + i * 0.1,
  close: 100 + i * 0.1,
  volume: 0,
}))

describe("useIndicatorOverlays", () => {
  it("returns sma20 by default and respects toggle changes", () => {
    const { result } = renderHook(() => useIndicatorOverlays(candles))
    expect(result.current.toggles.sma20).toBe(true)
    expect(result.current.overlays.sma20).not.toBeNull()
    expect(result.current.overlays.sma200).toBeNull()
    act(() => result.current.setToggles({ ...result.current.toggles, sma200: true, bollinger: true }))
    expect(result.current.overlays.sma200).not.toBeNull()
    expect(result.current.overlays.bollinger).not.toBeNull()
  })
})

describe("OverlayToggleBar", () => {
  it("renders four toggle labels and fires onChange", () => {
    let state = { sma20: false, sma50: false, sma200: false, bollinger: false }
    const onChange = (next: typeof state) => { state = next }
    render(<OverlayToggleBar toggles={state} onChange={onChange} />)
    expect(screen.getByText("SMA 20")).toBeInTheDocument()
    expect(screen.getByText("Bollinger")).toBeInTheDocument()
    fireEvent.click(screen.getByText("SMA 20"))
    // onChange flips the value
    expect(state.sma20).toBe(true)
  })
})

describe("IndicatorBanners", () => {
  it("renders nothing when banner list is empty", () => {
    const { container } = render(<IndicatorBanners banners={[]} />)
    expect(container.firstChild).toBeNull()
  })
  it("renders all kinds of banners", () => {
    render(
      <IndicatorBanners
        banners={[
          { kind: "golden", index: 1, message: "g" },
          { kind: "death", index: 2, message: "d" },
          { kind: "squeeze", index: 3, message: "s" },
        ]}
      />,
    )
    expect(screen.getByText("g")).toBeInTheDocument()
    expect(screen.getByText("d")).toBeInTheDocument()
    expect(screen.getByText("s")).toBeInTheDocument()
  })
})
