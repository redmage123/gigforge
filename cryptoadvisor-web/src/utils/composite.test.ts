import { describe, expect, it } from 'vitest'
import { computeComposite, toCompositeSignal } from './composite'

describe('computeComposite', () => {
  it('returns HOLD with empty inputs', () => {
    const r = computeComposite({ symbol: 'BTC' })
    expect(r.action).toBe('HOLD')
    expect(r.conviction).toBe(0)
    expect(r.contributors).toEqual([])
  })

  it('emits BUY when all signals are bullish', () => {
    const r = computeComposite({
      symbol: 'BTC',
      donchian: { action: 'BUY', magnitude: 0.05 },
      hmmRegime: 'bull',
      rsi: 65,
      macd: { histogram: 0.1, signal: 0.05 },
      sentiment: 0.5,
      bookImbalance: 0.6,
    })
    expect(r.action).toBe('BUY')
    expect(r.conviction).toBeGreaterThan(40)
    expect(r.contributors.length).toBe(6)
  })

  it('emits SELL when all signals are bearish', () => {
    const r = computeComposite({
      symbol: 'BTC',
      donchian: { action: 'SELL', magnitude: 0.04 },
      hmmRegime: 'bear',
      rsi: 30,
      macd: { histogram: -0.08, signal: 0.05 },
      sentiment: -0.6,
      bookImbalance: 0.35,
    })
    expect(r.action).toBe('SELL')
    expect(r.conviction).toBeGreaterThan(30)
  })

  it('HMM bear regime offsets a Donchian BUY', () => {
    const buyOnly = computeComposite({
      symbol: 'BTC',
      donchian: { action: 'BUY', magnitude: 0.03 },
    })
    const buyInBear = computeComposite({
      symbol: 'BTC',
      donchian: { action: 'BUY', magnitude: 0.03 },
      hmmRegime: 'bear',
    })
    expect(buyOnly.rawPolarity).toBeGreaterThan(buyInBear.rawPolarity)
  })

  it('high BTC mempool fees damp BTC conviction', () => {
    const lowFee = computeComposite({
      symbol: 'BTC',
      donchian: { action: 'BUY', magnitude: 0.04 },
      onchain: { btcFastFee: 5 },
    })
    const highFee = computeComposite({
      symbol: 'BTC',
      donchian: { action: 'BUY', magnitude: 0.04 },
      onchain: { btcFastFee: 200 },
    })
    expect(lowFee.rawPolarity).toBeGreaterThan(highFee.rawPolarity)
  })

  it('lead-lag from BTC moves the polarity correctly', () => {
    const r = computeComposite({
      symbol: 'ETH',
      leadLag: {
        btcMove: 0.05,
        expectedDirection: 'up',
        expectedLag: 2,
        confidence: 0.7,
      },
    })
    expect(r.rawPolarity).toBeGreaterThan(0)
  })

  it('contributors include human-readable detail strings', () => {
    const r = computeComposite({
      symbol: 'BTC',
      rsi: 80,
    })
    expect(r.contributors[0].detail).toContain('overbought')
  })

  it('toCompositeSignal serializes the top 3 contributors as the reason', () => {
    const c = computeComposite({
      symbol: 'BTC',
      donchian: { action: 'BUY', magnitude: 0.05 },
      hmmRegime: 'bull',
      sentiment: 0.4,
      bookImbalance: 0.62,
    })
    const s = toCompositeSignal(c)
    expect(s.source).toBe('composite')
    expect(s.contributors.length).toBeGreaterThan(0)
    expect(s.reason.length).toBeGreaterThan(10)
  })
})
