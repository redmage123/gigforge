import { describe, expect, it } from 'vitest'
import {
  computePortfolioStats,
  efficientFrontier,
  evaluatePortfolio,
  minimumVariancePortfolio,
  quantumAnnealPortfolio,
  riskParityPortfolio,
  tangencyPortfolio,
} from './portfolio'

function approx(actual: number, expected: number, tol = 0.05) {
  expect(Math.abs(actual - expected)).toBeLessThan(tol)
}

function geometric(start: number, drift: number, n: number, vol: number, seed: number): number[] {
  let p = start
  let s = seed
  const out = [p]
  for (let i = 1; i < n; i++) {
    s = (s * 9301 + 49297) % 233280
    const u = s / 233280
    const noise = (u - 0.5) * 2 * vol
    p *= Math.exp(drift + noise)
    out.push(p)
  }
  return out
}

const SERIES = {
  BTC: geometric(50000, 0.0008, 200, 0.02, 1),
  ETH: geometric(3000, 0.0006, 200, 0.025, 2),
  SOL: geometric(150, 0.001, 200, 0.04, 3),
  ADA: geometric(0.5, 0.0002, 200, 0.03, 4),
}

describe('computePortfolioStats', () => {
  it('produces ordered symbols, returns, and an n×n covariance', () => {
    const stats = computePortfolioStats({ series: SERIES })
    expect(stats.symbols).toEqual(['BTC', 'ETH', 'SOL', 'ADA'])
    expect(stats.expectedReturns).toHaveLength(4)
    expect(stats.covariance).toHaveLength(4)
    for (const row of stats.covariance) expect(row).toHaveLength(4)
    // Covariance diagonal must be non-negative.
    for (let i = 0; i < 4; i++) expect(stats.covariance[i][i]).toBeGreaterThanOrEqual(0)
    // Symmetry
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < 4; j++)
        approx(stats.covariance[i][j], stats.covariance[j][i], 1e-9)
  })

  it('handles empty inputs', () => {
    const stats = computePortfolioStats({ series: {} })
    expect(stats.symbols).toEqual([])
  })
})

describe('evaluatePortfolio', () => {
  it('uniform-weight portfolio sums weights to 1', () => {
    const stats = computePortfolioStats({ series: SERIES })
    const w = [0.25, 0.25, 0.25, 0.25]
    const m = evaluatePortfolio(w, stats)
    expect(Number.isFinite(m.expectedReturn)).toBe(true)
    expect(m.volatility).toBeGreaterThan(0)
    expect(Number.isFinite(m.sharpe)).toBe(true)
  })

  it('all-in single asset volatility = its own stdev', () => {
    const stats = computePortfolioStats({ series: SERIES })
    const w = [1, 0, 0, 0]
    const m = evaluatePortfolio(w, stats)
    approx(m.volatility, Math.sqrt(stats.covariance[0][0]), 0.001)
  })
})

describe('efficientFrontier', () => {
  it('returns the requested number of points and they are weight-normalized', () => {
    const stats = computePortfolioStats({ series: SERIES })
    const frontier = efficientFrontier(stats, 12)
    expect(frontier).toHaveLength(12)
    for (const p of frontier) {
      const sum = p.weights.reduce((a, b) => a + b, 0)
      approx(sum, 1, 0.01)
      for (const w of p.weights) {
        expect(w).toBeGreaterThanOrEqual(-0.01)
        expect(w).toBeLessThanOrEqual(1.01)
      }
    }
  })
})

describe('tangency / min-variance / risk-parity', () => {
  it('tangency portfolio has the highest Sharpe on the frontier', () => {
    const stats = computePortfolioStats({ series: SERIES })
    const tan = tangencyPortfolio(stats)
    const frontier = efficientFrontier(stats, 50)
    for (const p of frontier) {
      expect(tan.sharpe).toBeGreaterThanOrEqual(p.sharpe - 1e-9)
    }
  })

  it('minimum-variance portfolio has lowest volatility on the frontier', () => {
    const stats = computePortfolioStats({ series: SERIES })
    const mv = minimumVariancePortfolio(stats)
    const frontier = efficientFrontier(stats, 50)
    for (const p of frontier) {
      expect(mv.volatility).toBeLessThanOrEqual(p.volatility + 1e-9)
    }
  })

  it('risk-parity weights sum to 1 and favor lower-vol assets', () => {
    const stats = computePortfolioStats({ series: SERIES })
    const rp = riskParityPortfolio(stats)
    approx(rp.weights.reduce((a, b) => a + b, 0), 1, 0.001)
    // BTC has lowest individual vol → should get the largest weight.
    const maxIdx = rp.weights.indexOf(Math.max(...rp.weights))
    expect(maxIdx).toBe(0)
  })
})

describe('quantumAnnealPortfolio', () => {
  it('finds a Sharpe at least matching the uniform-weight portfolio', () => {
    const stats = computePortfolioStats({ series: SERIES })
    const uniform = evaluatePortfolio([0.25, 0.25, 0.25, 0.25], stats)
    const annealed = quantumAnnealPortfolio(stats, { iterations: 500, seed: 42 })
    expect(annealed.sharpe).toBeGreaterThanOrEqual(uniform.sharpe - 0.05)
    approx(annealed.weights.reduce((a, b) => a + b, 0), 1, 0.01)
  })

  it('records a non-decreasing best-so-far history', () => {
    const stats = computePortfolioStats({ series: SERIES })
    const out = quantumAnnealPortfolio(stats, { iterations: 200, seed: 7 })
    expect(out.history.length).toBe(200)
    for (let i = 1; i < out.history.length; i++) {
      expect(out.history[i]).toBeGreaterThanOrEqual(out.history[i - 1] - 1e-9)
    }
  })

  it('respects the variance objective when set', () => {
    const stats = computePortfolioStats({ series: SERIES })
    const minVarAnneal = quantumAnnealPortfolio(stats, {
      iterations: 500,
      seed: 1,
      objective: 'variance',
    })
    const uniform = evaluatePortfolio([0.25, 0.25, 0.25, 0.25], stats)
    expect(minVarAnneal.volatility).toBeLessThanOrEqual(uniform.volatility + 0.01)
  })

  it('handles empty inputs', () => {
    const stats = computePortfolioStats({ series: {} })
    const out = quantumAnnealPortfolio(stats)
    expect(out.weights).toEqual([])
    expect(out.history).toEqual([])
  })
})
