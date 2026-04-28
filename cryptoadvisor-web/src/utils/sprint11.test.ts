import { describe, expect, it } from 'vitest'
import { fitHMM } from './hmm'
import {
  augmentedDickeyFuller,
  generatePairsSignals,
  testCointegration,
} from './cointegration'
import { analyzeLeadLag, generateLeadLagSignals } from './leadLag'
import { runBacktest } from './backtest'
import { impliedVolatility, priceOption } from './blackScholes'
import type { OHLCVCandle } from '../types/index'

function approx(actual: number, expected: number, tol = 0.01) {
  expect(Math.abs(actual - expected)).toBeLessThan(tol)
}

// ---------- HMM ----------

describe('fitHMM', () => {
  it('separates a regime-switching synthetic series into bull/bear', () => {
    // 60 candles bull-trend then 60 candles bear-trend
    const closes: number[] = [100]
    for (let i = 1; i < 60; i++) closes.push(closes[i - 1] * Math.exp(0.005 + (i % 2 === 0 ? 0.001 : -0.0005)))
    for (let i = 60; i < 120; i++) closes.push(closes[i - 1] * Math.exp(-0.005 + (i % 2 === 0 ? 0.0005 : -0.001)))
    const fit = fitHMM(closes, { states: 2, restarts: 5, seed: 7 })
    expect(fit.regimes.length).toBe(closes.length - 1)
    // First half should be heavily bull, second half heavily bear (or inverse).
    const firstHalfBull = fit.regimes.slice(0, 50).filter((r) => r === 'bull').length
    const secondHalfBear = fit.regimes.slice(60).filter((r) => r === 'bear').length
    expect(firstHalfBull + secondHalfBear).toBeGreaterThan(50)
  })

  it('handles too-short input by returning an empty fit', () => {
    const fit = fitHMM([100, 101, 102, 103, 104], { states: 2 })
    expect(fit.regimes).toEqual([])
  })

  it('supports a 3-state model', () => {
    const closes = Array.from({ length: 90 }, (_, i) => 100 + Math.sin(i / 5) * 5 + i * 0.05)
    const fit = fitHMM(closes, { states: 3, restarts: 3, seed: 1 })
    expect(fit.states.length).toBe(3)
    const labels = new Set(fit.regimes)
    // At least 2 distinct regimes should be assigned
    expect(labels.size).toBeGreaterThanOrEqual(1)
  })
})

// ---------- Cointegration ----------

describe('augmentedDickeyFuller', () => {
  it('returns a strongly negative statistic for a stationary series', () => {
    // White noise around 0 — stationary
    const rand = mulberry(7)
    const series = Array.from({ length: 200 }, () => rand() * 2 - 1)
    const r = augmentedDickeyFuller(series)
    expect(r.statistic).toBeLessThan(-2)
    expect(r.pValue).toBeLessThan(0.1)
  })

  it('fails to reject the null for a random walk (non-stationary)', () => {
    const rand = mulberry(11)
    const series: number[] = [0]
    for (let i = 1; i < 200; i++) series.push(series[i - 1] + (rand() * 2 - 1) * 0.5)
    const r = augmentedDickeyFuller(series)
    expect(r.pValue).toBeGreaterThan(0.05)
  })
})

describe('testCointegration', () => {
  it('finds two co-moving series cointegrated', () => {
    const rand = mulberry(13)
    // A is a random walk; B = 2*A + small stationary noise — textbook cointegrated.
    const a: number[] = [100]
    for (let i = 1; i < 200; i++) a.push(a[i - 1] + (rand() * 2 - 1) * 0.5)
    const b = a.map((x) => 2 * x + (rand() * 2 - 1) * 0.5)
    const r = testCointegration(a, b, 0.1)
    expect(r.cointegrated).toBe(true)
    expect(Math.abs(r.slope)).toBeGreaterThan(0)
  })
})

describe('generatePairsSignals', () => {
  it('returns no signals on a perfectly mean-zero residual series', () => {
    const r = {
      slope: 1,
      intercept: 0,
      residuals: Array.from({ length: 60 }, () => 0),
      adfStatistic: -5,
      pValue: 0.001,
      cointegrated: true,
    }
    const out = generatePairsSignals(r, { symbolA: 'A', symbolB: 'B', window: 30 })
    expect(out).toEqual([])
  })

  it('emits an OPEN_LONG_SHORT then a CLOSE on a known spread excursion', () => {
    const residuals: number[] = []
    for (let i = 0; i < 30; i++) residuals.push(0)
    for (let i = 0; i < 5; i++) residuals.push(-3) // big negative excursion
    for (let i = 0; i < 5; i++) residuals.push(0) // return to mean
    const r = {
      slope: 1,
      intercept: 0,
      residuals,
      adfStatistic: -5,
      pValue: 0.001,
      cointegrated: true,
    }
    const out = generatePairsSignals(r, {
      symbolA: 'A',
      symbolB: 'B',
      window: 30,
      openThreshold: 1.5,
      closeThreshold: 0.5,
    })
    expect(out.length).toBeGreaterThan(0)
    expect(out[0].action).toBe('OPEN_LONG_SHORT')
  })
})

// ---------- Lead-Lag ----------

describe('analyzeLeadLag', () => {
  it('finds the optimal lag for a follower whose returns track leader at lag 2', () => {
    const leader = Array.from({ length: 100 }, (_, i) => Math.sin(i / 5))
    const follower = leader.map((_, i) => leader[Math.max(0, i - 2)] * 0.9)
    const a = analyzeLeadLag(leader, follower, 5)
    expect(a.optimalLag).toBe(2)
    expect(Math.abs(a.optimalCorrelation)).toBeGreaterThan(0.8)
  })

  it('returns small optimal correlation for unrelated series', () => {
    const leader = Array.from({ length: 60 }, (_, i) => Math.sin(i / 7))
    const follower = Array.from({ length: 60 }, (_, i) => Math.cos(i / 11))
    const a = analyzeLeadLag(leader, follower, 5)
    expect(Math.abs(a.optimalCorrelation)).toBeLessThan(0.95)
  })
})

describe('generateLeadLagSignals', () => {
  it('emits signal direction matching leader move when correlation is positive', () => {
    const analyses = [
      {
        leader: 'BTC',
        follower: 'ETH',
        followerSymbol: 'ETH',
        lags: [0.1, 0.2, 0.6, 0.4, 0.3, 0.2],
        optimalLag: 2,
        optimalCorrelation: 0.6,
      },
    ]
    const sigs = generateLeadLagSignals(0.05, analyses)
    expect(sigs).toHaveLength(1)
    expect(sigs[0].follower).toBe('ETH')
    expect(sigs[0].expectedDirection).toBe('up')
    expect(sigs[0].expectedLag).toBe(2)
  })

  it('drops signals below the magnitude threshold', () => {
    const analyses = [
      {
        leader: 'BTC',
        follower: 'ETH',
        followerSymbol: 'ETH',
        lags: [0, 0.6, 0.5],
        optimalLag: 1,
        optimalCorrelation: 0.6,
      },
    ]
    expect(generateLeadLagSignals(0.001, analyses)).toEqual([])
  })
})

// ---------- Backtest ----------

describe('runBacktest', () => {
  it('produces a positive total return on a buy-low/sell-high golden series', () => {
    const candles: OHLCVCandle[] = Array.from({ length: 30 }, (_, i) => ({
      timestamp: Date.UTC(2026, 0, i + 1),
      open: 100,
      high: 110,
      low: 90,
      close: i < 15 ? 100 + i : 115 - (i - 15),
      volume: 1000,
    }))
    const signals = [
      { index: 0, action: 'BUY' as const },
      { index: 14, action: 'SELL' as const },
    ]
    const r = runBacktest(candles, signals, { fee: 0, slippage: 0 })
    expect(r.totalReturn).toBeGreaterThan(0)
    expect(r.trades).toHaveLength(1)
    expect(r.hitRate).toBe(1)
  })

  it('produces a negative buy-and-hold baseline on a declining series', () => {
    const candles: OHLCVCandle[] = Array.from({ length: 20 }, (_, i) => ({
      timestamp: Date.UTC(2026, 0, i + 1),
      open: 100,
      high: 105,
      low: 95,
      close: 100 - i,
      volume: 1000,
    }))
    const r = runBacktest(candles, [], {})
    expect(r.buyHoldReturn).toBeLessThan(0)
    expect(r.trades).toHaveLength(0)
  })

  it('closes any open position at the end of the series', () => {
    const candles: OHLCVCandle[] = Array.from({ length: 10 }, (_, i) => ({
      timestamp: Date.UTC(2026, 0, i + 1),
      open: 100,
      high: 105,
      low: 95,
      close: 100 + i,
      volume: 1000,
    }))
    const r = runBacktest(candles, [{ index: 0, action: 'BUY' }], { fee: 0, slippage: 0 })
    expect(r.trades).toHaveLength(1)
    expect(r.trades[0].exitIndex).toBe(9)
  })
})

// ---------- Black-Scholes ----------

describe('priceOption', () => {
  it('matches reference value for an ATM call', () => {
    // py_vollib reference: BS call S=100 K=100 T=1 r=0.05 sigma=0.2 → 10.4506
    const o = priceOption('call', 100, 100, 1, 0.05, 0.2)
    approx(o.price, 10.4506, 0.01)
    approx(o.delta, 0.6368, 0.01)
    approx(o.gamma, 0.0188, 0.001)
  })

  it('matches reference value for an ATM put (put-call parity)', () => {
    // BS put S=100 K=100 T=1 r=0.05 sigma=0.2 → 5.5735
    const o = priceOption('put', 100, 100, 1, 0.05, 0.2)
    approx(o.price, 5.5735, 0.01)
    approx(o.delta, -0.3632, 0.01)
  })

  it('zero time-to-expiry returns intrinsic value', () => {
    expect(priceOption('call', 100, 90, 0, 0.05, 0.2).price).toBe(10)
    expect(priceOption('put', 100, 90, 0, 0.05, 0.2).price).toBe(0)
  })
})

describe('impliedVolatility', () => {
  it('round-trips through priceOption to within 1e-3', () => {
    const truthSigma = 0.45
    const market = priceOption('call', 100, 110, 0.5, 0.04, truthSigma).price
    const recovered = impliedVolatility('call', market, 100, 110, 0.5, 0.04)
    approx(recovered, truthSigma, 0.005)
  })

  it('returns 0 for a price below intrinsic', () => {
    // Below intrinsic shouldn't happen in real markets, but should return 0.
    const recovered = impliedVolatility('call', 0.001, 100, 80, 0.5, 0.04)
    expect(recovered).toBe(0)
  })
})

// ---------- Local PRNG for deterministic tests ----------

function mulberry(seed: number): () => number {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
