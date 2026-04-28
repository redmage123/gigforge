import { describe, expect, test } from 'vitest'
import { decodeAllocations, encodeAllocations } from './riskShareUrl'

describe('encodeAllocations', () => {
  test('joins symbol:pct pairs with commas, uppercased', () => {
    expect(
      encodeAllocations([
        { symbol: 'btc', pct: 50 },
        { symbol: 'eth', pct: 50 },
      ]),
    ).toBe('BTC:50,ETH:50')
  })

  test('skips empty symbols', () => {
    expect(
      encodeAllocations([
        { symbol: '', pct: 10 },
        { symbol: 'BTC', pct: 90 },
      ]),
    ).toBe('BTC:90')
  })

  test('empty input returns empty string', () => {
    expect(encodeAllocations([])).toBe('')
  })
})

describe('decodeAllocations', () => {
  test('parses BTC:50,ETH:50', () => {
    expect(decodeAllocations('BTC:50,ETH:50')).toEqual([
      { symbol: 'BTC', pct: 50 },
      { symbol: 'ETH', pct: 50 },
    ])
  })

  test('uppercases symbols', () => {
    expect(decodeAllocations('btc:100')).toEqual([{ symbol: 'BTC', pct: 100 }])
  })

  test('null on bad numeric', () => {
    expect(decodeAllocations('BTC:abc')).toBeNull()
  })

  test('null on empty string or null input', () => {
    expect(decodeAllocations(null)).toBeNull()
    expect(decodeAllocations('')).toBeNull()
  })

  test('handles fractional percentages', () => {
    expect(decodeAllocations('BTC:33.3,ETH:33.3,SOL:33.4')).toEqual([
      { symbol: 'BTC', pct: 33.3 },
      { symbol: 'ETH', pct: 33.3 },
      { symbol: 'SOL', pct: 33.4 },
    ])
  })
})

describe('round-trip', () => {
  test('encode then decode preserves the allocations', () => {
    const original = [
      { symbol: 'BTC', pct: 42 },
      { symbol: 'ETH', pct: 22 },
      { symbol: 'SOL', pct: 14 },
      { symbol: 'ADA', pct: 7 },
      { symbol: 'USD', pct: 15 },
    ]
    const encoded = encodeAllocations(original)
    expect(decodeAllocations(encoded)).toEqual(original)
  })
})
