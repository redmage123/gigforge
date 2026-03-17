import { chunkText } from '../src/lib/chunker'

describe('chunkText', () => {
  it('short text returns single chunk', () => {
    const result = chunkText('Hello world. This is a short sentence.')
    expect(result).toHaveLength(1)
    expect(result[0]).toContain('Hello world')
  })

  it('empty string returns empty array', () => {
    expect(chunkText('')).toEqual([])
    expect(chunkText('   ')).toEqual([])
  })

  it('long text splits into multiple chunks', () => {
    const long = 'A sentence here. '.repeat(100)
    const chunks = chunkText(long, 200)
    expect(chunks.length).toBeGreaterThan(1)
  })

  it('no chunk exceeds maxChars significantly (allowing overlap)', () => {
    const text = 'Short sentence. '.repeat(50)
    const maxChars = 100
    const chunks = chunkText(text, maxChars, 10)
    // Each chunk should not be wildly larger than maxChars + overlap
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThan(maxChars + 120)
    }
  })

  it('text without sentence boundaries is treated as single chunk when under maxChars', () => {
    const noPunctuation = 'this is text without any sentence ending punctuation marks at all'
    const chunks = chunkText(noPunctuation, 500)
    expect(chunks).toHaveLength(1)
    expect(chunks[0]).toBe(noPunctuation)
  })

  it('overlap produces content that appears in consecutive chunks', () => {
    // Build text that forces multiple chunks
    const sentence = 'The quick brown fox. '
    const text = sentence.repeat(60)
    const chunks = chunkText(text, 100, 30)
    expect(chunks.length).toBeGreaterThan(1)
    // The end of the first chunk should partially appear at the start of the second
    // (overlap means last 30 chars of chunk[0] are prepended to chunk[1])
    const tail = chunks[0].slice(-30)
    expect(chunks[1]).toContain(tail.trim().slice(0, 10))
  })
})
