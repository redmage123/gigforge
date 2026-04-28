import { describe, expect, it } from 'vitest'
import { aggregateSentiment, scoreText } from './sentiment'

describe('scoreText', () => {
  it('returns positive for unambiguously bullish text', () => {
    const s = scoreText('Bitcoin is mooning, this is a massive bullish breakout')
    expect(s.label).toBe('positive')
    expect(s.polarity).toBeGreaterThan(0.3)
  })

  it('returns negative for unambiguously bearish text', () => {
    const s = scoreText('Massive crash, the market is collapsing — full panic and capitulation')
    expect(s.label).toBe('negative')
    expect(s.polarity).toBeLessThan(-0.3)
  })

  it('handles negation correctly', () => {
    const plain = scoreText('this is bullish')
    const negated = scoreText('this is not bullish')
    expect(plain.polarity).toBeGreaterThan(0)
    expect(negated.polarity).toBeLessThan(plain.polarity)
  })

  it('handles intensifiers correctly', () => {
    const plain = scoreText('bullish')
    const intense = scoreText('extremely bullish')
    expect(intense.polarity).toBeGreaterThan(plain.polarity)
  })

  it('detects bigrams', () => {
    const s = scoreText('to the moon')
    expect(s.label).toBe('positive')
    expect(s.hits.some((h) => h.token === 'to the moon')).toBe(true)
  })

  it('detects death cross as bearish', () => {
    const s = scoreText('death cross confirmed on the daily')
    expect(s.label).toBe('negative')
  })

  it('returns neutral for empty or non-financial text', () => {
    expect(scoreText('').label).toBe('neutral')
    expect(scoreText('the cat sat on the mat').label).toBe('neutral')
  })
})

describe('aggregateSentiment', () => {
  it('weights items by their importance', () => {
    const result = aggregateSentiment([
      { text: 'bullish moon', weight: 100 },
      { text: 'rugpull crash', weight: 1 },
    ])
    // Heavily upweighted positive should win
    expect(result.polarity).toBeGreaterThan(0.2)
    expect(result.count).toBe(2)
  })

  it('returns 0 polarity on empty input', () => {
    const r = aggregateSentiment([])
    expect(r.polarity).toBe(0)
    expect(r.count).toBe(0)
  })

  it('classifies items into pos/neg/neu buckets', () => {
    const r = aggregateSentiment([
      { text: 'bullish breakout' },
      { text: 'bearish crash' },
      { text: 'the day was sunny' },
    ])
    expect(r.positive).toBe(1)
    expect(r.negative).toBe(1)
    expect(r.neutral).toBe(1)
  })
})
