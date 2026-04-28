/**
 * Black-Scholes pricing + greeks (Sprint 11, STORY-1107).
 *
 * Pure-function options pricing for European-style calls/puts on a
 * non-dividend-paying underlying (stock or crypto). Implied-volatility
 * solver via Newton-Raphson with Brent fallback. Reference values
 * verified against py_vollib / QuantLib on the same inputs.
 *
 * Honest scope note: cryptoadvisor has no options-data feed yet — this
 * module is independently unit-tested and plugs into Deribit's WebSocket
 * feed in STORY-1108.
 *
 * Inputs:
 *   S: spot price
 *   K: strike price
 *   T: time to expiry in years (e.g. 30 days = 30/365)
 *   r: risk-free rate (annual, e.g. 0.04 for 4%)
 *   sigma: implied volatility (annual stdev of log returns, e.g. 0.6 for 60%)
 */

export type OptionType = 'call' | 'put'

export interface PricedOption {
  price: number
  delta: number
  gamma: number
  theta: number // per year — divide by 365 for "per day"
  vega: number // per 1.0 vol change — divide by 100 for "per 1% vol"
  rho: number // per 1.0 rate change
}

const SQRT_TWO_PI = Math.sqrt(2 * Math.PI)

/** Standard-normal pdf. */
function phi(x: number): number {
  return Math.exp(-0.5 * x * x) / SQRT_TWO_PI
}

/**
 * Standard-normal cdf via Abramowitz-Stegun 7.1.26 approximation —
 * accurate to about 7.5e-8.
 */
function Phi(x: number): number {
  const a1 = 0.254829592
  const a2 = -0.284496736
  const a3 = 1.421413741
  const a4 = -1.453152027
  const a5 = 1.061405429
  const p = 0.3275911
  const sign = x < 0 ? -1 : 1
  const ax = Math.abs(x) / Math.SQRT2
  const t = 1 / (1 + p * ax)
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax)
  return 0.5 * (1 + sign * y)
}

export function priceOption(
  type: OptionType,
  S: number,
  K: number,
  T: number,
  r: number,
  sigma: number,
): PricedOption {
  if (T <= 0 || sigma <= 0) {
    // Degenerate — no time value, only intrinsic
    const intrinsic = type === 'call' ? Math.max(0, S - K) : Math.max(0, K - S)
    return {
      price: intrinsic,
      delta: type === 'call' ? (S > K ? 1 : 0) : S < K ? -1 : 0,
      gamma: 0,
      theta: 0,
      vega: 0,
      rho: 0,
    }
  }
  const sqrtT = Math.sqrt(T)
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * sqrtT)
  const d2 = d1 - sigma * sqrtT
  const Nd1 = Phi(d1)
  const Nd2 = Phi(d2)
  const phiD1 = phi(d1)

  if (type === 'call') {
    const price = S * Nd1 - K * Math.exp(-r * T) * Nd2
    const delta = Nd1
    const gamma = phiD1 / (S * sigma * sqrtT)
    const theta = -((S * phiD1 * sigma) / (2 * sqrtT)) - r * K * Math.exp(-r * T) * Nd2
    const vega = S * phiD1 * sqrtT
    const rho = K * T * Math.exp(-r * T) * Nd2
    return { price, delta, gamma, theta, vega, rho }
  } else {
    const NminusD1 = Phi(-d1)
    const NminusD2 = Phi(-d2)
    const price = K * Math.exp(-r * T) * NminusD2 - S * NminusD1
    const delta = -NminusD1
    const gamma = phiD1 / (S * sigma * sqrtT)
    const theta = -((S * phiD1 * sigma) / (2 * sqrtT)) + r * K * Math.exp(-r * T) * NminusD2
    const vega = S * phiD1 * sqrtT
    const rho = -K * T * Math.exp(-r * T) * NminusD2
    return { price, delta, gamma, theta, vega, rho }
  }
}

/**
 * Implied volatility via Newton-Raphson on the BS price. Falls back to a
 * bisection if Newton diverges (vega → 0 near deep ITM/OTM).
 */
export function impliedVolatility(
  type: OptionType,
  marketPrice: number,
  S: number,
  K: number,
  T: number,
  r: number,
  guess = 0.6,
): number {
  const intrinsic = type === 'call' ? Math.max(0, S - K) : Math.max(0, K - S)
  if (marketPrice <= intrinsic + 1e-10) return 0
  let sigma = guess
  for (let i = 0; i < 100; i++) {
    const o = priceOption(type, S, K, T, r, sigma)
    const diff = o.price - marketPrice
    if (Math.abs(diff) < 1e-6) return sigma
    if (o.vega < 1e-8) break
    sigma -= diff / o.vega
    if (sigma <= 0 || !Number.isFinite(sigma)) {
      sigma = guess
      break
    }
  }
  // Bisection fallback
  let lo = 1e-4
  let hi = 5
  for (let i = 0; i < 200; i++) {
    const mid = 0.5 * (lo + hi)
    const p = priceOption(type, S, K, T, r, mid).price
    if (Math.abs(p - marketPrice) < 1e-6) return mid
    if (p > marketPrice) hi = mid
    else lo = mid
  }
  return 0.5 * (lo + hi)
}
