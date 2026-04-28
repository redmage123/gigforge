import { describe, expect, it } from 'vitest'
import {
  applyDelta,
  applySnapshot,
  depthChartData,
  depthWeightedPrice,
  emptyBook,
  summarize,
} from './orderBook'

const seedBook = () => {
  const b = emptyBook('BTCUSDT', 'binance')
  return applySnapshot(
    b,
    [
      { price: 50000, size: 0.5 },
      { price: 49990, size: 1.0 },
      { price: 49980, size: 2.0 },
    ],
    [
      { price: 50010, size: 0.4 },
      { price: 50020, size: 1.2 },
      { price: 50030, size: 1.8 },
    ],
    1,
  )
}

describe('orderBook snapshot/delta', () => {
  it('snapshot sorts bids descending, asks ascending', () => {
    const b = applySnapshot(
      emptyBook('X', 'test'),
      [
        { price: 100, size: 1 },
        { price: 105, size: 1 },
        { price: 102, size: 1 },
      ],
      [
        { price: 110, size: 1 },
        { price: 108, size: 1 },
      ],
      1,
    )
    expect(b.bids.map((l) => l.price)).toEqual([105, 102, 100])
    expect(b.asks.map((l) => l.price)).toEqual([108, 110])
  })

  it('delta with size=0 deletes a level; non-zero replaces', () => {
    const b = seedBook()
    const next = applyDelta(
      b,
      [
        { price: 49990, size: 0 }, // delete
        { price: 49995, size: 0.7 }, // insert
      ],
      [{ price: 50010, size: 0.6 }], // replace
      2,
    )
    expect(next.bids.find((l) => l.price === 49990)).toBeUndefined()
    expect(next.bids.find((l) => l.price === 49995)?.size).toBe(0.7)
    expect(next.asks.find((l) => l.price === 50010)?.size).toBe(0.6)
    expect(next.lastUpdateId).toBe(2)
  })
})

describe('summarize', () => {
  it('reports best bid/ask, spread, and balanced imbalance', () => {
    const b = seedBook()
    const s = summarize(b, 10)
    expect(s.bestBid).toBe(50000)
    expect(s.bestAsk).toBe(50010)
    expect(s.spread).toBe(10)
    expect(s.mid).toBe(50005)
    expect(s.spreadBps).toBeCloseTo(2, 0) // 10 / 50005 * 1e4 ≈ 2 bps
    expect(s.imbalance).toBeGreaterThan(0.45)
    expect(s.imbalance).toBeLessThan(0.6)
  })

  it('returns 0.5 imbalance for an empty book', () => {
    const s = summarize(emptyBook('X', 'test'))
    expect(s.imbalance).toBe(0.5)
    expect(s.bestBid).toBeNull()
  })
})

describe('depthWeightedPrice', () => {
  it('walks the ask side for a buy and reports avg fill price', () => {
    const b = seedBook()
    // Buy 1.0 → eats 0.4 @ 50010 + 0.6 @ 50020
    const r = depthWeightedPrice(b, 'bid', 1.0)
    expect(r).not.toBeNull()
    const expectedAvg = (0.4 * 50010 + 0.6 * 50020) / 1.0
    expect(r!.avgPrice).toBeCloseTo(expectedAvg, 2)
    expect(r!.consumedLevels).toBe(2)
  })

  it('returns null when book is thinner than requested quantity', () => {
    const b = seedBook()
    expect(depthWeightedPrice(b, 'bid', 100)).toBeNull()
  })
})

describe('depthChartData', () => {
  it('produces monotonically-increasing cumulative size on each side', () => {
    const b = seedBook()
    const data = depthChartData(b, 50)
    const bidPoints = data.filter((p) => p.side === 'bid')
    const askPoints = data.filter((p) => p.side === 'ask')
    for (let i = 1; i < bidPoints.length; i++) {
      expect(bidPoints[i].cumulativeSize).toBeGreaterThanOrEqual(bidPoints[i - 1].cumulativeSize)
    }
    for (let i = 1; i < askPoints.length; i++) {
      expect(askPoints[i].cumulativeSize).toBeGreaterThanOrEqual(askPoints[i - 1].cumulativeSize)
    }
  })
})
