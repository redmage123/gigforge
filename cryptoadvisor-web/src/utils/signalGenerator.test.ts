import { describe, expect, it } from 'vitest'
import { generateDonchianSignals } from './signalGenerator'
import type { OHLCVCandle } from '../types/index'

function candle(i: number, high: number, low: number, close: number): OHLCVCandle {
  return {
    timestamp: new Date(2026, 0, i + 1).getTime(),
    open: close,
    high,
    low,
    close,
    volume: 0,
  }
}

describe('generateDonchianSignals', () => {
  it('returns no signals when the candle count is below the period', () => {
    const candles = Array.from({ length: 10 }, (_, i) => candle(i, 105, 95, 100))
    const out = generateDonchianSignals(candles, { symbol: 'BTC', period: 20 })
    expect(out).toEqual([])
  })

  it('emits a BUY when close breaks above the prior 20-day high', () => {
    const flat = Array.from({ length: 20 }, (_, i) => candle(i, 105, 95, 100))
    const breakout = candle(20, 120, 100, 115)
    const out = generateDonchianSignals([...flat, breakout], { symbol: 'BTC', period: 20 })
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({
      symbol: 'BTC',
      action: 'BUY',
      price: 115,
      level: 105,
      source: 'donchian',
      index: 20,
    })
  })

  it('emits a SELL when close breaks below the prior 20-day low', () => {
    const flat = Array.from({ length: 20 }, (_, i) => candle(i, 105, 95, 100))
    const breakdown = candle(20, 95, 80, 85)
    const out = generateDonchianSignals([...flat, breakdown], { symbol: 'ETH', period: 20 })
    expect(out).toHaveLength(1)
    expect(out[0].action).toBe('SELL')
    expect(out[0].level).toBe(95)
    expect(out[0].price).toBe(85)
  })

  it('does not emit a signal when close stays inside the channel', () => {
    const flat = Array.from({ length: 25 }, (_, i) => candle(i, 105, 95, 100))
    const out = generateDonchianSignals(flat, { symbol: 'BTC', period: 20 })
    expect(out).toEqual([])
  })

  it('emits multiple signals across a series', () => {
    const candles: OHLCVCandle[] = []
    for (let i = 0; i < 20; i++) candles.push(candle(i, 105, 95, 100))
    candles.push(candle(20, 120, 100, 115)) // BUY (breaks above 105 prior high)
    for (let i = 21; i < 40; i++) candles.push(candle(i, 120, 110, 115))
    candles.push(candle(40, 110, 90, 95)) // SELL (breaks below 110 prior low)
    const out = generateDonchianSignals(candles, { symbol: 'BTC', period: 20 })
    expect(out.length).toBeGreaterThanOrEqual(2)
    expect(out[0].action).toBe('BUY')
    expect(out[out.length - 1].action).toBe('SELL')
  })
})

import { toEditorialSignal } from "./signalGenerator"

describe("toEditorialSignal", () => {
  it("shapes a BUY signal with breakout-magnitude confidence and human reason", () => {
    const generated = {
      id: "donchian-BTC-1",
      symbol: "BTC",
      action: "BUY" as const,
      price: 110,
      level: 100,
      timestamp: Date.UTC(2026, 3, 1),
      source: "donchian" as const,
      index: 30,
    }
    const out = toEditorialSignal(generated)
    expect(out.id).toBe("donchian-BTC-1")
    expect(out.asset).toBe("BTC")
    expect(out.direction).toBe("BUY")
    expect(out.source).toBe("donchian")
    expect(out.reason).toContain("above prior 20-day high")
    // 10% breakout → confidence ~210 capped at 95
    expect(out.confidence).toBe(95)
  })

  it("shapes a SELL signal correctly and yields lower confidence on small breakouts", () => {
    const generated = {
      id: "donchian-ETH-1",
      symbol: "ETH",
      action: "SELL" as const,
      price: 99,
      level: 100,
      timestamp: Date.UTC(2026, 3, 1),
      source: "donchian" as const,
      index: 30,
    }
    const out = toEditorialSignal(generated)
    expect(out.direction).toBe("SELL")
    expect(out.reason).toContain("below prior 20-day low")
    // 1% breakout → 60 + 15 = 75 confidence
    expect(out.confidence).toBeGreaterThan(60)
    expect(out.confidence).toBeLessThanOrEqual(95)
  })
})
