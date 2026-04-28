import { describe, expect, it } from 'vitest'
import {
  atmRow,
  buildVolatilitySmile,
  ivPercentile,
  ivRank,
  putCallSkew,
} from './optionAnalytics'
import type { OptionChain } from '../api/deribit'

function fakeChain(): OptionChain {
  const make = (mark_iv: number, delta = 0): any => ({
    instrument_name: '',
    underlying_price: 50000,
    mark_price: 100,
    mark_iv,
    bid_price: 95,
    ask_price: 105,
    open_interest: 1,
    volume: 1,
    delta,
    gamma: 0,
    theta: 0,
    vega: 0,
  })
  return {
    expiry: 0,
    expiryLabel: 'now',
    underlyingPrice: 50000,
    rows: [
      { strike: 45000, call: make(0.7, 0.9), put: make(0.85, -0.1) },
      { strike: 50000, call: make(0.5, 0.5), put: make(0.5, -0.5) },
      { strike: 55000, call: make(0.55, 0.1), put: make(0.65, -0.9) },
    ],
  }
}

describe('buildVolatilitySmile', () => {
  it('averages call+put IV when both present', () => {
    const out = buildVolatilitySmile(fakeChain())
    expect(out).toHaveLength(3)
    expect(out[1].iv).toBeCloseTo(0.5, 5)
  })
})

describe('atmRow', () => {
  it('picks the strike nearest to spot', () => {
    const row = atmRow(fakeChain())
    expect(row?.strike).toBe(50000)
  })
})

describe('putCallSkew', () => {
  it('positive when OTM puts are more expensive than OTM calls', () => {
    expect(putCallSkew(fakeChain())).toBeGreaterThan(0)
  })
})

describe('ivRank / ivPercentile', () => {
  it('ranks a current value in the middle of the history at 50%', () => {
    expect(ivRank(0.5, [0.4, 0.5, 0.6])).toBeCloseTo(50, 0)
    expect(ivPercentile(0.5, [0.4, 0.5, 0.6])).toBeCloseTo(33.33, 0)
  })

  it('ranks a current value above all history at 100%', () => {
    expect(ivRank(0.7, [0.4, 0.5, 0.6])).toBe(100)
    expect(ivPercentile(0.7, [0.4, 0.5, 0.6])).toBe(100)
  })
})
