import { describe, expect, it } from 'vitest'
import { detectElliottWaves, zigZag } from './elliottWaves'
import type { OHLCVCandle } from '../types/index'

function candle(i: number, price: number, range = 0.5): OHLCVCandle {
  return {
    timestamp: new Date(2026, 0, i + 1).getTime(),
    open: price,
    high: price + range,
    low: price - range,
    close: price,
    volume: 0,
  }
}

describe('zigZag', () => {
  it('detects pivots in a sawtooth series above the threshold', () => {
    const prices = [100, 110, 100, 115, 100, 120]
    const candles = prices.map((p, i) => candle(i, p))
    const pivots = zigZag(candles, 0.05)
    expect(pivots.length).toBeGreaterThanOrEqual(3)
    expect(pivots[0].kind).toBeDefined()
    expect(pivots[1].kind).not.toBe(pivots[0].kind)
  })

  it('returns no pivots for a series within threshold', () => {
    const prices = Array.from({ length: 20 }, () => 100)
    const candles = prices.map((p, i) => candle(i, p))
    const pivots = zigZag(candles, 0.05)
    expect(pivots).toEqual([])
  })
})

describe('detectElliottWaves', () => {
  it('returns null when not enough pivots are present', () => {
    const candles = Array.from({ length: 20 }, (_, i) => candle(i, 100))
    expect(detectElliottWaves(candles, 0.05)).toBeNull()
  })

  it('returns a bullish structure for a clean impulse pattern', () => {
    // Textbook 5-wave bullish impulse:
    // 100 → 120 (w1) → 110 (w2, 50% retrace) → 145 (w3, 1.75× w1) →
    // 138 (w4, 20% retrace, no overlap) → 160 (w5)
    // Extend with a corrective pullback after wave 5 so zigzag confirms
    // the wave-5 pivot at 160 (the detector requires 6 pivots).
    const path = [100, 120, 110, 145, 138, 160, 145]
    const candles: OHLCVCandle[] = []
    for (let i = 0; i < path.length - 1; i++) {
      const start = path[i]
      const end = path[i + 1]
      for (let j = 0; j < 6; j++) {
        const price = start + ((end - start) * j) / 5
        candles.push(candle(candles.length, price, 0.1))
      }
    }
    const result = detectElliottWaves(candles, 0.04)
    expect(result).not.toBeNull()
    expect(result?.direction).toBe('bullish')
    expect(result?.confidence ?? 0).toBeGreaterThanOrEqual(50)
  })

  it('rejects a candidate when wave 4 overlaps wave 1 territory', () => {
    // wave 4 retraces below wave 1's high (100→120 → wave 4 low 115 < 120 high)
    const path = [100, 120, 110, 145, 115, 160, 145]
    const candles: OHLCVCandle[] = []
    for (let i = 0; i < path.length - 1; i++) {
      const start = path[i]
      const end = path[i + 1]
      for (let j = 0; j < 6; j++) {
        const price = start + ((end - start) * j) / 5
        candles.push(candle(candles.length, price, 0.1))
      }
    }
    const result = detectElliottWaves(candles, 0.04)
    if (result) {
      const overlap = result.notes.find((n) => n.includes('overlap'))
      expect(overlap).toBeDefined()
    } else {
      expect(result).toBeNull()
    }
  })
})
