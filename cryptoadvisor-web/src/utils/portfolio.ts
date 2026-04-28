/**
 * Modern Portfolio Theory + quantum-inspired optimization (Sprint 10).
 *
 * STORY-1008: efficient frontier, tangency portfolio (max Sharpe), minimum
 * variance, risk parity. Operates on annualized log-return statistics
 * computed by `utils/statistics.ts`.
 *
 * STORY-1009: simulated quantum annealing (SQA) for portfolio weight
 * search. The "quantum-inspired" qualifier is intentional — this runs in
 * pure JS and offers no asymptotic advantage over classical solvers at the
 * 4-10 asset scale of cryptoadvisor's watchlist. Real quantum hardware
 * integration would require a Qiskit/D-Wave backend service (filed as
 * STORY-1201 for Sprint 12).
 *
 * WHY ship this anyway: the SQA solver handles non-convex objectives
 * (e.g. max Sharpe with cardinality constraints) better than gradient
 * descent on small problems, and the implementation is transparent enough
 * to be educational rather than magical.
 */

import { logReturns } from './statistics'

const TRADING_DAYS_PER_YEAR = 365
const DEFAULT_RISK_FREE_RATE = 0.04

// ---------- Mean-variance inputs ----------

export interface AssetInputs {
  /** Symbol → closing-price series. */
  series: Record<string, number[]>
  /** Annualized risk-free rate. Default 4% (USD treasuries 2026). */
  riskFreeRate?: number
}

export interface PortfolioStats {
  /** Symbols in canonical (input-key) order. */
  symbols: string[]
  /** Annualized expected return per asset. */
  expectedReturns: number[]
  /** Annualized return covariance matrix. */
  covariance: number[][]
  riskFreeRate: number
}

export function computePortfolioStats(inputs: AssetInputs): PortfolioStats {
  const { series, riskFreeRate = DEFAULT_RISK_FREE_RATE } = inputs
  const symbols = Object.keys(series)
  if (symbols.length === 0) {
    return { symbols, expectedReturns: [], covariance: [], riskFreeRate }
  }
  const minLen = Math.min(...symbols.map((s) => series[s].length))
  const returns = symbols.map((s) => logReturns(series[s].slice(-minLen)))
  const expectedReturns = returns.map(
    (r) => mean(r) * TRADING_DAYS_PER_YEAR,
  )
  const covariance = covarianceMatrix(returns)
  return { symbols, expectedReturns, covariance, riskFreeRate }
}

function mean(xs: number[]): number {
  if (xs.length === 0) return 0
  let sum = 0
  for (const x of xs) sum += x
  return sum / xs.length
}

function covarianceMatrix(returns: number[][]): number[][] {
  const n = returns.length
  if (n === 0) return []
  const len = Math.min(...returns.map((r) => r.length))
  const means = returns.map((r) => mean(r))
  const cov: number[][] = []
  for (let i = 0; i < n; i++) {
    cov.push([])
    for (let j = 0; j < n; j++) {
      let s = 0
      for (let k = 0; k < len; k++) {
        s += (returns[i][k] - means[i]) * (returns[j][k] - means[j])
      }
      cov[i].push((s / len) * TRADING_DAYS_PER_YEAR)
    }
  }
  return cov
}

// ---------- Portfolio metrics from weights ----------

export interface PortfolioMetrics {
  weights: number[]
  expectedReturn: number
  volatility: number
  sharpe: number
}

export function evaluatePortfolio(
  weights: number[],
  stats: PortfolioStats,
): PortfolioMetrics {
  const { expectedReturns, covariance, riskFreeRate } = stats
  const ret = dot(weights, expectedReturns)
  let vari = 0
  for (let i = 0; i < weights.length; i++) {
    for (let j = 0; j < weights.length; j++) {
      vari += weights[i] * weights[j] * covariance[i][j]
    }
  }
  const vol = Math.sqrt(Math.max(0, vari))
  const sharpe = vol === 0 ? 0 : (ret - riskFreeRate) / vol
  return { weights, expectedReturn: ret, volatility: vol, sharpe }
}

function dot(a: number[], b: number[]): number {
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i] * b[i]
  return s
}

// ---------- Efficient frontier (long-only, fully invested) ----------

/**
 * Sample the efficient frontier by varying the target return between the
 * minimum and maximum expected return across the asset set, then for each
 * target finding the long-only fully-invested weight vector minimizing
 * variance via projected coordinate descent.
 *
 * `points`: number of frontier samples. 30 is a smooth visual default.
 */
export function efficientFrontier(stats: PortfolioStats, points = 30): PortfolioMetrics[] {
  const { expectedReturns } = stats
  const n = expectedReturns.length
  if (n === 0) return []
  const minR = Math.min(...expectedReturns)
  const maxR = Math.max(...expectedReturns)
  const out: PortfolioMetrics[] = []
  for (let p = 0; p < points; p++) {
    const target = minR + ((maxR - minR) * p) / Math.max(1, points - 1)
    const w = minVarianceForTarget(stats, target)
    out.push(evaluatePortfolio(w, stats))
  }
  return out
}

function minVarianceForTarget(stats: PortfolioStats, targetReturn: number): number[] {
  const n = stats.expectedReturns.length
  // Initialize weights uniformly.
  let w = new Array(n).fill(1 / n)
  // Projected coordinate descent: 200 iterations works for n ≤ 10.
  for (let iter = 0; iter < 200; iter++) {
    for (let i = 0; i < n; i++) {
      const step = 0.05
      // Try increase / decrease at i, take the move that reduces variance
      // while satisfying the target-return constraint within tolerance.
      const candidates = [w.slice(), w.slice(), w.slice()]
      candidates[1][i] = Math.max(0, w[i] - step)
      candidates[2][i] = Math.min(1, w[i] + step)
      let best = w
      let bestScore = Infinity
      for (const c of candidates) {
        const norm = c.reduce((a, b) => a + b, 0)
        if (norm === 0) continue
        const proj = c.map((x) => x / norm)
        const m = evaluatePortfolio(proj, stats)
        const penalty = (m.expectedReturn - targetReturn) ** 2 * 100
        const score = m.volatility + penalty
        if (score < bestScore) {
          bestScore = score
          best = proj
        }
      }
      w = best
    }
  }
  return w
}

// ---------- Tangency portfolio (max Sharpe) ----------

export function tangencyPortfolio(stats: PortfolioStats): PortfolioMetrics {
  const frontier = efficientFrontier(stats, 50)
  if (frontier.length === 0) {
    return {
      weights: [],
      expectedReturn: 0,
      volatility: 0,
      sharpe: 0,
    }
  }
  return frontier.reduce((best, p) => (p.sharpe > best.sharpe ? p : best), frontier[0])
}

// ---------- Minimum variance portfolio ----------

export function minimumVariancePortfolio(stats: PortfolioStats): PortfolioMetrics {
  const frontier = efficientFrontier(stats, 50)
  if (frontier.length === 0) {
    return {
      weights: [],
      expectedReturn: 0,
      volatility: 0,
      sharpe: 0,
    }
  }
  return frontier.reduce(
    (best, p) => (p.volatility < best.volatility ? p : best),
    frontier[0],
  )
}

// ---------- Risk parity (inverse-volatility weighting) ----------

/**
 * Risk-parity weights — each asset contributes equal volatility to the
 * portfolio. Implemented as inverse-volatility weights (a fast
 * approximation that is exact only when correlations are uniform).
 */
export function riskParityPortfolio(stats: PortfolioStats): PortfolioMetrics {
  const n = stats.expectedReturns.length
  const vols = stats.covariance.map((row, i) => Math.sqrt(Math.max(0, row[i])))
  const inv = vols.map((v) => (v > 0 ? 1 / v : 0))
  const total = inv.reduce((a, b) => a + b, 0)
  const w = total > 0 ? inv.map((x) => x / total) : new Array(n).fill(1 / n)
  return evaluatePortfolio(w, stats)
}

// ---------- Quantum-inspired simulated annealing for portfolio search ----------

export interface AnnealOptions {
  /** Number of Metropolis sweeps. */
  iterations?: number
  /** Initial temperature. */
  initialTemperature?: number
  /** Final temperature (schedule endpoint). */
  finalTemperature?: number
  /** Quantum-tunneling strength Γ — boosts acceptance of large weight shuffles. */
  tunnelStrength?: number
  /** Random seed for deterministic runs. */
  seed?: number
  /**
   * Objective: 'sharpe' (max Sharpe, default), 'variance' (min variance),
   * or 'return' (max return — usually unconstrained, included for testing).
   */
  objective?: 'sharpe' | 'variance' | 'return'
}

/**
 * Simulated quantum annealing portfolio search.
 *
 * Honest framing: this runs in pure JS and gives no asymptotic advantage
 * over the classical solvers above at small problem sizes. It is included
 * for two reasons: (1) the metropolis + tunneling search handles
 * non-convex objectives gracefully (cardinality constraints, lot sizes,
 * etc.) and (2) the algorithm is transparent enough to inspect. Real
 * quantum hardware integration tracked in STORY-1201 (Sprint 12).
 *
 * Algorithm:
 *   - State: a normalized long-only weight vector summing to 1.
 *   - Move: randomly shuffle a small amount of weight from one asset to
 *     another (classical) or perform a "quantum tunneling" jump where two
 *     random weights are swapped wholesale (escapes local minima).
 *   - Accept by Metropolis P_classical = exp(-ΔE/T) plus a tunneling
 *     bonus P_quantum = Γ * exp(-|ΔE|/T^0.5).
 *   - Temperature follows an exponential cooling schedule.
 */
export function quantumAnnealPortfolio(
  stats: PortfolioStats,
  opts: AnnealOptions = {},
): PortfolioMetrics & { history: number[] } {
  const {
    iterations = 1000,
    initialTemperature = 0.5,
    finalTemperature = 0.005,
    tunnelStrength = 0.15,
    seed = 1,
    objective = 'sharpe',
  } = opts
  const n = stats.expectedReturns.length
  if (n === 0) {
    return {
      weights: [],
      expectedReturn: 0,
      volatility: 0,
      sharpe: 0,
      history: [],
    }
  }
  const rand = mulberry32(seed)
  const tau = -iterations / Math.log(finalTemperature / initialTemperature)

  const score = (w: number[]): number => {
    const m = evaluatePortfolio(w, stats)
    if (objective === 'variance') return m.volatility
    if (objective === 'return') return -m.expectedReturn
    // Default: maximize Sharpe → minimize -Sharpe
    return -m.sharpe
  }

  let current = new Array(n).fill(1 / n)
  let currentE = score(current)
  let best = current.slice()
  let bestE = currentE
  const history: number[] = []

  for (let t = 0; t < iterations; t++) {
    const T = initialTemperature * Math.exp(-t / tau)
    const candidate = current.slice()
    if (rand() < 0.85) {
      // Classical move: shift δ from i to j.
      const i = Math.floor(rand() * n)
      let j = Math.floor(rand() * n)
      if (j === i) j = (j + 1) % n
      const delta = rand() * 0.2 * T // smaller moves at lower T
      const move = Math.min(candidate[i], delta)
      candidate[i] -= move
      candidate[j] += move
    } else {
      // Quantum tunnel: swap two assets' weights entirely.
      const i = Math.floor(rand() * n)
      let j = Math.floor(rand() * n)
      if (j === i) j = (j + 1) % n
      const tmp = candidate[i]
      candidate[i] = candidate[j]
      candidate[j] = tmp
    }
    // Renormalize defensively.
    const norm = candidate.reduce((a, b) => a + b, 0)
    if (norm <= 0) continue
    for (let k = 0; k < n; k++) candidate[k] /= norm

    const candE = score(candidate)
    const dE = candE - currentE
    const pClassical = dE <= 0 ? 1 : Math.exp(-dE / T)
    const pQuantum =
      dE > 0 ? tunnelStrength * Math.exp(-Math.abs(dE) / Math.max(1e-6, Math.sqrt(T))) : 0
    const acceptP = Math.min(1, pClassical + pQuantum)

    if (rand() < acceptP) {
      current = candidate
      currentE = candE
      if (candE < bestE) {
        bestE = candE
        best = candidate.slice()
      }
    }
    history.push(-bestE) // Track best Sharpe (negate back) over time
  }

  return { ...evaluatePortfolio(best, stats), history }
}

function mulberry32(seed: number): () => number {
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
