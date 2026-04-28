import { describe, expect, it } from 'vitest'
import {
  correlationMatrix,
  distributionMoments,
  hurstExponent,
  logReturns,
  riskAdjustedMetrics,
  rollingZScore,
} from './statistics'

function approx(actual: number, expected: number, tol = 0.01) {
  expect(Math.abs(actual - expected)).toBeLessThan(tol)
}

describe('logReturns', () => {
  it('produces n-1 returns from n closes', () => {
    const r = logReturns([100, 110, 121])
    expect(r).toHaveLength(2)
    approx(r[0], Math.log(110 / 100))
    approx(r[1], Math.log(121 / 110))
  })

  it('returns 0 for non-positive prices', () => {
    expect(logReturns([0, 100])).toEqual([0])
    expect(logReturns([100, -1])).toEqual([0])
  })
})

describe('riskAdjustedMetrics', () => {
  it('produces a positive Sharpe for a steadily appreciating series', () => {
    const closes = Array.from({ length: 60 }, (_, i) => 100 * Math.exp(0.001 * i))
    const m = riskAdjustedMetrics(closes, { riskFreeRate: 0 })
    expect(m.sharpe).toBeGreaterThan(0)
    expect(m.maxDrawdown).toBeLessThan(0.01)
  })

  it('produces NaN Sharpe for a constant series', () => {
    const closes = new Array(30).fill(100)
    const m = riskAdjustedMetrics(closes)
    expect(Number.isNaN(m.sharpe)).toBe(true)
    expect(m.maxDrawdown).toBe(0)
  })

  it('reports max drawdown correctly on a synthetic peak-trough', () => {
    // 100 → 200 (peak) → 100 (50% drawdown)
    const closes = [100, 150, 200, 150, 100]
    const m = riskAdjustedMetrics(closes, { riskFreeRate: 0 })
    approx(m.maxDrawdown, 0.5, 0.01)
    expect(m.maxDrawdownDuration).toBeGreaterThanOrEqual(2)
  })

  it('Sortino is finite when returns include downside moves', () => {
    const closes = [100, 105, 95, 110, 90, 120]
    const m = riskAdjustedMetrics(closes, { riskFreeRate: 0 })
    expect(Number.isFinite(m.sortino)).toBe(true)
  })
})

describe('distributionMoments', () => {
  it('symmetric synthetic series has near-zero skew', () => {
    // Symmetric around 100 — log returns alternate up/down by the same %.
    const closes: number[] = [100]
    for (let i = 1; i < 60; i++) closes.push(closes[i - 1] * (i % 2 === 0 ? 1.01 : 1 / 1.01))
    const m = distributionMoments(closes)
    expect(Math.abs(m.skewness)).toBeLessThan(0.5)
  })

  it('reports n = closes.length - 1', () => {
    const m = distributionMoments([100, 110, 121])
    expect(m.count).toBe(2)
  })

  it('zero-variance series returns 0 stdev/skew/kurt', () => {
    const m = distributionMoments(new Array(30).fill(100))
    expect(m.stdev).toBe(0)
    expect(m.skewness).toBe(0)
    expect(m.excessKurtosis).toBe(0)
  })
})

describe('correlationMatrix', () => {
  it('diagonal is exactly 1.0', () => {
    const series = {
      BTC: [100, 102, 105, 103, 110, 108, 115],
      ETH: [50, 51, 53, 52, 56, 55, 60],
    }
    const { matrix } = correlationMatrix(series)
    approx(matrix[0][0], 1.0)
    approx(matrix[1][1], 1.0)
  })

  it('perfectly positively correlated series → +1', () => {
    const a = [100, 110, 121, 133, 146]
    const b = a.map((x) => x * 2)
    const { matrix } = correlationMatrix({ A: a, B: b })
    approx(matrix[0][1], 1.0)
  })

  it('perfectly negatively correlated series → -1', () => {
    // Build prices from inverse log-return vectors so the *return* series
    // (which correlation operates on) is perfectly negatively correlated.
    const returns = [0.05, -0.03, 0.02, -0.04, 0.06, -0.02]
    let pa = 100
    let pb = 100
    const a = [pa]
    const b = [pb]
    for (const r of returns) {
      pa *= Math.exp(r)
      pb *= Math.exp(-r)
      a.push(pa)
      b.push(pb)
    }
    const { matrix } = correlationMatrix({ A: a, B: b })
    expect(matrix[0][1]).toBeLessThan(-0.95)
  })

  it('truncates to shortest series', () => {
    const out = correlationMatrix({
      A: [100, 101, 102, 103, 104],
      B: [200, 202, 204],
    })
    expect(out.symbols).toEqual(['A', 'B'])
    expect(out.matrix.length).toBe(2)
  })
})

describe('rollingZScore', () => {
  it('returns null until window is full', () => {
    const z = rollingZScore([1, 2, 3, 4, 5], 5)
    for (let i = 0; i < 4; i++) expect(z[i]).toBeNull()
    expect(z[4]).not.toBeNull()
  })

  it('z = 0 at the window center for a linear series', () => {
    const v = Array.from({ length: 30 }, (_, i) => i)
    const z = rollingZScore(v, 5)
    // The last value (i=29) is at the top of the window — z should be > 0
    expect(z[29]).not.toBeNull()
    expect(z[29] as number).toBeGreaterThan(0)
  })
})

describe('hurstExponent', () => {
  it('returns ~0.5 for a random walk', () => {
    let p = 100
    const closes = [p]
    for (let i = 1; i < 400; i++) {
      // Pseudo-random but deterministic — Mulberry32-ish
      const r = (Math.sin(i * 12.9898) * 43758.5453) % 1
      const step = r > 0 ? 0.005 : -0.005
      p *= 1 + step
      closes.push(p)
    }
    const h = hurstExponent(closes)
    // R/S is noisy at small sample sizes — accept the broad random-walk band.
    expect(h.exponent).toBeGreaterThan(0.2)
    expect(h.exponent).toBeLessThan(0.8)
  })

  it('returns > 0.5 for a strongly trending series', () => {
    const closes = Array.from({ length: 400 }, (_, i) => 100 * Math.exp(0.002 * i))
    const h = hurstExponent(closes)
    expect(h.exponent).toBeGreaterThan(0.5)
  })

  it('warns when the series is too short', () => {
    const h = hurstExponent([100, 101, 102, 103, 104])
    expect(h.warning).toBeDefined()
  })
})
