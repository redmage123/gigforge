/**
 * Hidden Markov Model regime classifier (Sprint 11, STORY-1102).
 *
 * Implements a Gaussian-emission HMM trained via Baum-Welch (EM) to label
 * each candle with the most-likely market regime. Default 2-state model
 * (bull / bear) with a 3-state option (bull / bear / sideways).
 *
 * Honest scope notes:
 *   - HMMs are sensitive to initialization. We run multiple random seeds
 *     and return the highest-likelihood fit.
 *   - The state-to-regime label mapping is heuristic: states are sorted by
 *     mean emission so state 0 is "bear" (lowest mean log return), state
 *     N-1 is "bull" (highest mean), and any middle state is "sideways".
 *   - Confidence is the average posterior probability of the assigned
 *     state — higher confidence = sharper regime separation.
 *
 * Reference values verified against `hmmlearn.GaussianHMM` on the same
 * synthetic regime-switching series.
 */

export type Regime = 'bull' | 'bear' | 'sideways'

export interface HMMState {
  mean: number
  variance: number
}

export interface HMMFit {
  states: HMMState[]
  /** transition[i][j] = P(state j at t+1 | state i at t). */
  transition: number[][]
  /** initial[i] = P(state i at t=0). */
  initial: number[]
  /** Sequence of most-likely regime per input candle (Viterbi decoded). */
  regimes: Regime[]
  /** Per-candle posterior probability of the decoded state. */
  confidences: number[]
  /** Final log-likelihood from the best random restart. */
  logLikelihood: number
}

export interface HMMOptions {
  /** Number of regimes to fit. */
  states?: 2 | 3
  /** Maximum EM iterations per restart. */
  maxIterations?: number
  /** Number of random initializations; the best by log-likelihood is returned. */
  restarts?: number
  /** Seed for the deterministic PRNG used to sample initializations. */
  seed?: number
  /** Convergence tolerance on relative log-likelihood change. */
  tolerance?: number
}

export function fitHMM(closes: number[], opts: HMMOptions = {}): HMMFit {
  const {
    states = 2,
    maxIterations = 200,
    restarts = 5,
    seed = 1,
    tolerance = 1e-5,
  } = opts

  const returns = logReturnsLocal(closes)
  if (returns.length < states * 5) {
    return emptyFit(states)
  }

  const rand = mulberry32(seed)
  let best: HMMFit | null = null

  for (let r = 0; r < restarts; r++) {
    const init = randomInit(states, returns, rand)
    const fit = baumWelch(returns, init, maxIterations, tolerance)
    if (!best || fit.logLikelihood > best.logLikelihood) {
      best = fit
    }
  }
  return best ?? emptyFit(states)
}

// ---------- Baum-Welch ----------

interface RawHMM {
  states: HMMState[]
  transition: number[][]
  initial: number[]
}

function baumWelch(
  returns: number[],
  init: RawHMM,
  maxIterations: number,
  tolerance: number,
): HMMFit {
  let model = init
  let prevLL = -Infinity

  for (let iter = 0; iter < maxIterations; iter++) {
    const { alpha, beta, gamma, xi, logLikelihood } = forwardBackward(returns, model)
    if (Math.abs(logLikelihood - prevLL) < tolerance && iter > 0) break
    prevLL = logLikelihood
    model = mStep(returns, gamma, xi)
    void alpha
    void beta
  }

  const { gamma, logLikelihood } = forwardBackward(returns, model)
  const path = viterbi(returns, model)
  const regimes = labelRegimes(path, model)
  const confidences = path.map((s, t) => gamma[t][s] ?? 0)
  return {
    states: model.states,
    transition: model.transition,
    initial: model.initial,
    regimes,
    confidences,
    logLikelihood,
  }
}

interface FwdBwd {
  alpha: number[][]
  beta: number[][]
  gamma: number[][]
  xi: number[][][]
  logLikelihood: number
}

function forwardBackward(returns: number[], m: RawHMM): FwdBwd {
  const T = returns.length
  const N = m.states.length

  // Forward
  const alpha: number[][] = Array.from({ length: T }, () => new Array(N).fill(0))
  const scale: number[] = new Array(T).fill(0)
  for (let i = 0; i < N; i++) alpha[0][i] = m.initial[i] * emit(returns[0], m.states[i])
  scale[0] = sumArr(alpha[0]) || 1e-300
  for (let i = 0; i < N; i++) alpha[0][i] /= scale[0]
  for (let t = 1; t < T; t++) {
    for (let j = 0; j < N; j++) {
      let s = 0
      for (let i = 0; i < N; i++) s += alpha[t - 1][i] * m.transition[i][j]
      alpha[t][j] = s * emit(returns[t], m.states[j])
    }
    scale[t] = sumArr(alpha[t]) || 1e-300
    for (let j = 0; j < N; j++) alpha[t][j] /= scale[t]
  }

  // Backward
  const beta: number[][] = Array.from({ length: T }, () => new Array(N).fill(0))
  for (let i = 0; i < N; i++) beta[T - 1][i] = 1 / scale[T - 1]
  for (let t = T - 2; t >= 0; t--) {
    for (let i = 0; i < N; i++) {
      let s = 0
      for (let j = 0; j < N; j++) {
        s += m.transition[i][j] * emit(returns[t + 1], m.states[j]) * beta[t + 1][j]
      }
      beta[t][i] = s / scale[t]
    }
  }

  // Gamma
  const gamma: number[][] = Array.from({ length: T }, () => new Array(N).fill(0))
  for (let t = 0; t < T; t++) {
    let denom = 0
    for (let i = 0; i < N; i++) {
      gamma[t][i] = alpha[t][i] * beta[t][i] * scale[t]
      denom += gamma[t][i]
    }
    if (denom > 0) for (let i = 0; i < N; i++) gamma[t][i] /= denom
  }

  // Xi
  const xi: number[][][] = Array.from({ length: T - 1 }, () =>
    Array.from({ length: N }, () => new Array(N).fill(0)),
  )
  for (let t = 0; t < T - 1; t++) {
    let denom = 0
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        xi[t][i][j] =
          alpha[t][i] * m.transition[i][j] * emit(returns[t + 1], m.states[j]) * beta[t + 1][j]
        denom += xi[t][i][j]
      }
    }
    if (denom > 0) {
      for (let i = 0; i < N; i++)
        for (let j = 0; j < N; j++) xi[t][i][j] /= denom
    }
  }

  let logLikelihood = 0
  for (const s of scale) logLikelihood += Math.log(s)
  return { alpha, beta, gamma, xi, logLikelihood }
}

function mStep(returns: number[], gamma: number[][], xi: number[][][]): RawHMM {
  const T = returns.length
  const N = gamma[0].length

  // Initial probabilities
  const initial = gamma[0].slice()

  // Transition matrix
  const transition: number[][] = Array.from({ length: N }, () => new Array(N).fill(0))
  for (let i = 0; i < N; i++) {
    let denom = 0
    for (let t = 0; t < T - 1; t++) denom += gamma[t][i]
    for (let j = 0; j < N; j++) {
      let num = 0
      for (let t = 0; t < T - 1; t++) num += xi[t][i][j]
      transition[i][j] = denom === 0 ? 1 / N : num / denom
    }
  }

  // Emissions
  const states: HMMState[] = []
  for (let i = 0; i < N; i++) {
    let weight = 0
    let weightedMean = 0
    for (let t = 0; t < T; t++) {
      weight += gamma[t][i]
      weightedMean += gamma[t][i] * returns[t]
    }
    const mean = weight === 0 ? 0 : weightedMean / weight
    let variance = 0
    for (let t = 0; t < T; t++) variance += gamma[t][i] * (returns[t] - mean) ** 2
    variance = weight === 0 ? 1e-6 : variance / weight
    if (variance < 1e-8) variance = 1e-8
    states.push({ mean, variance })
  }
  return { states, transition, initial }
}

function viterbi(returns: number[], m: RawHMM): number[] {
  const T = returns.length
  const N = m.states.length
  const delta: number[][] = Array.from({ length: T }, () => new Array(N).fill(-Infinity))
  const psi: number[][] = Array.from({ length: T }, () => new Array(N).fill(0))
  for (let i = 0; i < N; i++) {
    delta[0][i] = Math.log(m.initial[i] || 1e-300) + Math.log(emit(returns[0], m.states[i]) || 1e-300)
  }
  for (let t = 1; t < T; t++) {
    for (let j = 0; j < N; j++) {
      let bestI = 0
      let bestScore = -Infinity
      for (let i = 0; i < N; i++) {
        const v = delta[t - 1][i] + Math.log(m.transition[i][j] || 1e-300)
        if (v > bestScore) {
          bestScore = v
          bestI = i
        }
      }
      delta[t][j] = bestScore + Math.log(emit(returns[t], m.states[j]) || 1e-300)
      psi[t][j] = bestI
    }
  }
  // Backtrace
  const path: number[] = new Array(T).fill(0)
  let last = 0
  let lastScore = -Infinity
  for (let i = 0; i < N; i++) {
    if (delta[T - 1][i] > lastScore) {
      lastScore = delta[T - 1][i]
      last = i
    }
  }
  path[T - 1] = last
  for (let t = T - 2; t >= 0; t--) path[t] = psi[t + 1][path[t + 1]]
  return path
}

// ---------- Helpers ----------

function emit(x: number, state: HMMState): number {
  const v = Math.max(state.variance, 1e-9)
  const z = (x - state.mean) ** 2 / v
  return Math.exp(-0.5 * z) / Math.sqrt(2 * Math.PI * v)
}

function labelRegimes(path: number[], m: RawHMM): Regime[] {
  // Sort states by mean emission to map indices to regime labels.
  const order = m.states
    .map((s, i) => ({ i, mean: s.mean }))
    .sort((a, b) => a.mean - b.mean)
    .map((x) => x.i)
  const N = order.length
  const idxToLabel: Record<number, Regime> = {}
  if (N === 2) {
    idxToLabel[order[0]] = 'bear'
    idxToLabel[order[1]] = 'bull'
  } else {
    idxToLabel[order[0]] = 'bear'
    idxToLabel[order[1]] = 'sideways'
    idxToLabel[order[2]] = 'bull'
  }
  return path.map((s) => idxToLabel[s] ?? 'sideways')
}

function randomInit(states: number, returns: number[], rand: () => number): RawHMM {
  // K-means-style mean initialization: pick `states` random returns.
  const means: number[] = []
  for (let i = 0; i < states; i++) {
    means.push(returns[Math.floor(rand() * returns.length)])
  }
  means.sort((a, b) => a - b)
  const overall = avg(returns)
  const variance = Math.max(
    1e-6,
    returns.reduce((s, r) => s + (r - overall) ** 2, 0) / returns.length,
  )
  return {
    states: means.map((m) => ({ mean: m, variance })),
    transition: uniformTransition(states),
    initial: new Array(states).fill(1 / states),
  }
}

function uniformTransition(n: number): number[][] {
  const t: number[][] = []
  for (let i = 0; i < n; i++) {
    const row: number[] = []
    for (let j = 0; j < n; j++) row.push(i === j ? 0.9 : 0.1 / (n - 1))
    t.push(row)
  }
  return t
}

function emptyFit(states: number): HMMFit {
  const N = states
  return {
    states: new Array(N).fill(0).map(() => ({ mean: 0, variance: 1 })),
    transition: uniformTransition(N),
    initial: new Array(N).fill(1 / N),
    regimes: [],
    confidences: [],
    logLikelihood: -Infinity,
  }
}

function logReturnsLocal(closes: number[]): number[] {
  const out: number[] = []
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] <= 0 || closes[i] <= 0) {
      out.push(0)
      continue
    }
    out.push(Math.log(closes[i] / closes[i - 1]))
  }
  return out
}

function avg(xs: number[]): number {
  if (xs.length === 0) return 0
  let s = 0
  for (const x of xs) s += x
  return s / xs.length
}

function sumArr(xs: number[]): number {
  let s = 0
  for (const x of xs) s += x
  return s
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
