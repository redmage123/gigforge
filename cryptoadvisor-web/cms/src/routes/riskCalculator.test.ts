import { describe, expect, test } from 'vitest'
import { computeRisk, parseAllocations } from './riskCalculator.service'

describe('computeRisk — reference calculations', () => {
  test('single asset = maximum concentration', () => {
    const result = computeRisk([{ symbol: 'BTC', pct: 100 }])
    expect(result.hhi).toBe(1.0)
    expect(result.riskTier).toBe('high')
    expect(result.diversificationScore).toBe(0)
  })

  test('two equal assets', () => {
    const result = computeRisk([
      { symbol: 'BTC', pct: 50 },
      { symbol: 'ETH', pct: 50 },
    ])
    expect(result.hhi).toBeCloseTo(0.5, 4)
    expect(result.riskTier).toBe('high')
    expect(result.diversificationScore).toBe(50)
  })

  test('three near-equal assets', () => {
    const result = computeRisk([
      { symbol: 'BTC', pct: 34 },
      { symbol: 'ETH', pct: 33 },
      { symbol: 'SOL', pct: 33 },
    ])
    expect(result.hhi).toBeCloseTo(0.3334, 3)
    expect(result.riskTier).toBe('medium')
  })

  test('four equal assets', () => {
    const result = computeRisk([
      { symbol: 'BTC', pct: 25 },
      { symbol: 'ETH', pct: 25 },
      { symbol: 'SOL', pct: 25 },
      { symbol: 'ADA', pct: 25 },
    ])
    expect(result.hhi).toBeCloseTo(0.25, 4)
    expect(result.riskTier).toBe('medium')
    expect(result.diversificationScore).toBe(75)
  })

  test('five equal assets — diversified', () => {
    const result = computeRisk([
      { symbol: 'BTC', pct: 20 },
      { symbol: 'ETH', pct: 20 },
      { symbol: 'SOL', pct: 20 },
      { symbol: 'ADA', pct: 20 },
      { symbol: 'USD', pct: 20 },
    ])
    expect(result.hhi).toBeCloseTo(0.2, 4)
    expect(result.riskTier).toBe('low')
  })

  test('largest position correctly identified', () => {
    const result = computeRisk([
      { symbol: 'BTC', pct: 42 },
      { symbol: 'ETH', pct: 22 },
      { symbol: 'SOL', pct: 14 },
      { symbol: 'ADA', pct: 7 },
      { symbol: 'USD', pct: 15 },
    ])
    expect(result.largestPosition).toEqual({ symbol: 'BTC', pct: 42 })
    expect(result.assetCount).toBe(5)
  })
})

describe('parseAllocations — validation', () => {
  test('parses valid input', () => {
    const r = parseAllocations('BTC:50,ETH:50')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.allocations).toEqual([
        { symbol: 'BTC', pct: 50 },
        { symbol: 'ETH', pct: 50 },
      ])
    }
  })

  test('uppercases symbols', () => {
    const r = parseAllocations('btc:100')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.allocations[0].symbol).toBe('BTC')
  })

  test('rejects sum != 100', () => {
    const r = parseAllocations('BTC:50,ETH:40')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.message).toMatch(/sum to 100/)
  })

  test('rejects negative percentages', () => {
    const r = parseAllocations('BTC:110,ETH:-10')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.message).toMatch(/non-negative/)
  })

  test('rejects duplicate symbols', () => {
    const r = parseAllocations('BTC:50,BTC:50')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.message).toMatch(/Duplicate symbol: BTC/)
  })

  test('rejects more than 20 assets', () => {
    const pairs = Array.from({ length: 21 }, (_, i) => `S${i}:${100 / 21}`).join(',')
    const r = parseAllocations(pairs)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.message).toMatch(/Maximum 20 assets/)
  })

  test('rejects malformed pair (no colon)', () => {
    const r = parseAllocations('BTC')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.message).toMatch(/Invalid allocation format: BTC/)
  })

  test('rejects non-numeric percentage', () => {
    const r = parseAllocations('BTC:abc')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.message).toMatch(/Invalid allocation percentage: abc/)
  })

  test('rejects empty input', () => {
    const r = parseAllocations('')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.message).toMatch(/required/)
  })

  test('tolerates 0.5 rounding error', () => {
    const r = parseAllocations('BTC:33.3,ETH:33.3,SOL:33.4')
    expect(r.ok).toBe(true)
  })
})
