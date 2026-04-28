/**
 * Strategy backtester (Sprint 11, STORY-1105).
 *
 * Replays a signal generator over historical OHLCV and simulates a single-
 * asset portfolio with configurable starting capital, slippage, and fees.
 * Outputs the equity curve, drawdown series, and a summary stats panel
 * (hit rate, avg win/loss, Sharpe, Sortino, profit factor).
 *
 * Comparison baseline: buy-and-hold over the same period.
 */

import type { OHLCVCandle } from '../types/index'

export type SignalAction = 'BUY' | 'SELL' | 'CLOSE'

export interface BacktestSignal {
  index: number
  action: SignalAction
}

export interface BacktestOptions {
  startingCapital?: number
  slippage?: number // fraction, e.g. 0.001 = 0.1%
  fee?: number // fraction per trade, e.g. 0.0005
}

export interface Trade {
  entryIndex: number
  exitIndex: number
  entryPrice: number
  exitPrice: number
  pnl: number
  pnlPct: number
}

export interface BacktestResult {
  equityCurve: number[]
  drawdownPct: number[]
  trades: Trade[]
  finalEquity: number
  totalReturn: number
  buyHoldEquity: number[]
  buyHoldReturn: number
  hitRate: number
  averageWinPct: number
  averageLossPct: number
  profitFactor: number
  sharpe: number
  sortino: number
  maxDrawdown: number
}

const TRADING_DAYS_PER_YEAR = 365

export function runBacktest(
  candles: OHLCVCandle[],
  signals: BacktestSignal[],
  opts: BacktestOptions = {},
): BacktestResult {
  const { startingCapital = 10000, slippage = 0.001, fee = 0.0005 } = opts
  const n = candles.length
  const sigByIndex = new Map<number, SignalAction>()
  for (const s of signals) sigByIndex.set(s.index, s.action)

  const equityCurve: number[] = new Array(n).fill(startingCapital)
  const drawdownPct: number[] = new Array(n).fill(0)
  const trades: Trade[] = []
  let equity = startingCapital
  let peakEquity = equity
  let position: { entryIndex: number; entryPrice: number } | null = null

  for (let i = 0; i < n; i++) {
    const action = sigByIndex.get(i)
    const close = candles[i].close

    // Mark-to-market
    let mtm = equity
    if (position) {
      const grossReturn = (close - position.entryPrice) / position.entryPrice
      mtm = equity * (1 + grossReturn)
    }
    equityCurve[i] = mtm
    if (mtm > peakEquity) peakEquity = mtm
    drawdownPct[i] = peakEquity === 0 ? 0 : (mtm - peakEquity) / peakEquity

    if (!position && action === 'BUY') {
      // Open long with slippage + fee
      const fillPrice = close * (1 + slippage)
      equity *= 1 - fee
      position = { entryIndex: i, entryPrice: fillPrice }
    } else if (position && (action === 'SELL' || action === 'CLOSE')) {
      const fillPrice = close * (1 - slippage)
      const grossReturn = (fillPrice - position.entryPrice) / position.entryPrice
      equity *= 1 + grossReturn
      equity *= 1 - fee
      const pnlPct = grossReturn - 2 * fee
      trades.push({
        entryIndex: position.entryIndex,
        exitIndex: i,
        entryPrice: position.entryPrice,
        exitPrice: fillPrice,
        pnl: equity * grossReturn,
        pnlPct,
      })
      position = null
    }
  }

  // Close any open position at the last close
  if (position) {
    const last = candles[n - 1]
    const fillPrice = last.close * (1 - slippage)
    const grossReturn = (fillPrice - position.entryPrice) / position.entryPrice
    equity *= 1 + grossReturn
    equity *= 1 - fee
    trades.push({
      entryIndex: position.entryIndex,
      exitIndex: n - 1,
      entryPrice: position.entryPrice,
      exitPrice: fillPrice,
      pnl: equity * grossReturn,
      pnlPct: grossReturn - 2 * fee,
    })
    equityCurve[n - 1] = equity
  }

  // Summary
  const wins = trades.filter((t) => t.pnlPct > 0)
  const losses = trades.filter((t) => t.pnlPct < 0)
  const hitRate = trades.length === 0 ? 0 : wins.length / trades.length
  const averageWinPct = wins.length === 0 ? 0 : wins.reduce((s, t) => s + t.pnlPct, 0) / wins.length
  const averageLossPct =
    losses.length === 0 ? 0 : losses.reduce((s, t) => s + t.pnlPct, 0) / losses.length
  const totalWin = wins.reduce((s, t) => s + t.pnlPct, 0)
  const totalLoss = Math.abs(losses.reduce((s, t) => s + t.pnlPct, 0))
  const profitFactor = totalLoss === 0 ? (totalWin > 0 ? Infinity : 0) : totalWin / totalLoss

  // Sharpe / Sortino on equity-curve returns
  const equityReturns: number[] = []
  for (let i = 1; i < equityCurve.length; i++) {
    if (equityCurve[i - 1] > 0) {
      equityReturns.push(equityCurve[i] / equityCurve[i - 1] - 1)
    }
  }
  const meanR = avg(equityReturns)
  const stdR = stdev(equityReturns, meanR)
  const sharpe =
    stdR === 0 ? 0 : (meanR / stdR) * Math.sqrt(TRADING_DAYS_PER_YEAR)
  const downside = equityReturns.filter((r) => r < 0)
  let downStd = 0
  if (downside.length > 0) {
    let s = 0
    for (const r of downside) s += r * r
    downStd = Math.sqrt(s / equityReturns.length)
  }
  const sortino =
    downStd === 0 ? 0 : (meanR / downStd) * Math.sqrt(TRADING_DAYS_PER_YEAR)
  const maxDrawdown = Math.abs(Math.min(0, ...drawdownPct))

  // Buy & hold baseline
  const startPrice = candles[0]?.close ?? 0
  const buyHoldEquity = candles.map((c) =>
    startPrice === 0 ? startingCapital : startingCapital * (c.close / startPrice),
  )
  const buyHoldReturn =
    startingCapital === 0
      ? 0
      : buyHoldEquity[buyHoldEquity.length - 1] / startingCapital - 1

  return {
    equityCurve,
    drawdownPct,
    trades,
    finalEquity: equity,
    totalReturn: startingCapital === 0 ? 0 : equity / startingCapital - 1,
    buyHoldEquity,
    buyHoldReturn,
    hitRate,
    averageWinPct,
    averageLossPct,
    profitFactor,
    sharpe,
    sortino,
    maxDrawdown,
  }
}

function avg(xs: number[]): number {
  if (xs.length === 0) return 0
  let s = 0
  for (const x of xs) s += x
  return s / xs.length
}

function stdev(xs: number[], m: number): number {
  if (xs.length === 0) return 0
  let s = 0
  for (const x of xs) s += (x - m) ** 2
  return Math.sqrt(s / xs.length)
}
