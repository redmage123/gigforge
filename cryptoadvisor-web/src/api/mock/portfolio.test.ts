import { describe, it, expect } from 'vitest'
import { getPortfolio } from './portfolio'

describe('getPortfolio', () => {
  it('resolves with a portfolio object', async () => {
    const portfolio = await getPortfolio()
    expect(portfolio).toBeDefined()
  })

  it('returns correct totalValue', async () => {
    const portfolio = await getPortfolio()
    expect(typeof portfolio.totalValue).toBe('number')
    expect(portfolio.totalValue).toBeGreaterThan(0)
  })

  it('returns change24h and changePct24h', async () => {
    const portfolio = await getPortfolio()
    expect(typeof portfolio.change24h).toBe('number')
    expect(typeof portfolio.changePct24h).toBe('number')
  })

  it('returns holdings array with at least one item', async () => {
    const portfolio = await getPortfolio()
    expect(Array.isArray(portfolio.holdings)).toBe(true)
    expect(portfolio.holdings.length).toBeGreaterThan(0)
  })

  it('holdings have required fields', async () => {
    const portfolio = await getPortfolio()
    const holding = portfolio.holdings[0]
    expect(holding).toBeDefined()
    expect(typeof holding!.asset).toBe('string')
    expect(typeof holding!.symbol).toBe('string')
    expect(typeof holding!.amount).toBe('number')
    expect(typeof holding!.value).toBe('number')
    expect(typeof holding!.allocationPct).toBe('number')
    expect(typeof holding!.avgBuyPrice).toBe('number')
    expect(typeof holding!.currentPrice).toBe('number')
    expect(typeof holding!.pnl).toBe('number')
    expect(typeof holding!.pnlPct).toBe('number')
  })

  it('returns same data on every call (deterministic)', async () => {
    const p1 = await getPortfolio()
    const p2 = await getPortfolio()
    expect(p1.totalValue).toBe(p2.totalValue)
    expect(p1.holdings.length).toBe(p2.holdings.length)
  })
})
