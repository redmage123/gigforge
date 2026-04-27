import { describe, it, expect } from 'vitest'
import { getPrices } from './prices'

describe('getPrices', () => {
  it('returns 30 candles for BTC 1D', async () => {
    const data = await getPrices('BTC', '1D')
    expect(data.candles).toHaveLength(30)
  })

  it('returns 30 candles for each timeframe', async () => {
    const d1 = await getPrices('BTC', '1D')
    const w1 = await getPrices('BTC', '1W')
    const m1 = await getPrices('BTC', '1M')
    expect(d1.candles).toHaveLength(30)
    expect(w1.candles).toHaveLength(30)
    expect(m1.candles).toHaveLength(30)
  })

  it('returns correct asset and timeframe metadata', async () => {
    const data = await getPrices('ETH', '1W')
    expect(data.asset).toBe('ETH')
    expect(data.timeframe).toBe('1W')
  })

  it('candles have required OHLCV fields', async () => {
    const data = await getPrices('BTC', '1D')
    const candle = data.candles[0]
    expect(candle).toBeDefined()
    expect(typeof candle!.timestamp).toBe('number')
    expect(typeof candle!.open).toBe('number')
    expect(typeof candle!.high).toBe('number')
    expect(typeof candle!.low).toBe('number')
    expect(typeof candle!.close).toBe('number')
    expect(typeof candle!.volume).toBe('number')
  })

  it('changing asset produces different data', async () => {
    const btc = await getPrices('BTC', '1D')
    const eth = await getPrices('ETH', '1D')
    expect(btc.candles[0]!.close).not.toBe(eth.candles[0]!.close)
  })

  it('changing timeframe produces different data', async () => {
    const d1 = await getPrices('BTC', '1D')
    const w1 = await getPrices('BTC', '1W')
    expect(d1.candles[0]!.timestamp).not.toBe(w1.candles[0]!.timestamp)
  })

  it('BTC 1D prices are in a realistic range', async () => {
    const data = await getPrices('BTC', '1D')
    for (const c of data.candles) {
      expect(c.open).toBeGreaterThan(10000)
      expect(c.close).toBeGreaterThan(10000)
      expect(c.high).toBeGreaterThanOrEqual(Math.max(c.open, c.close))
      expect(c.low).toBeLessThanOrEqual(Math.min(c.open, c.close))
    }
  })

  it('returns deterministic data on repeated calls', async () => {
    const d1 = await getPrices('BTC', '1D')
    const d2 = await getPrices('BTC', '1D')
    expect(d1.candles[0]!.close).toBe(d2.candles[0]!.close)
  })
})
