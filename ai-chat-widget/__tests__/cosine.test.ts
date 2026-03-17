import { cosineSimilarity, DivisionByZeroError } from '../src/lib/cosine'

describe('cosineSimilarity', () => {
  it('identical vectors return 1.0', () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1.0)
    expect(cosineSimilarity([3, 4, 0], [3, 4, 0])).toBeCloseTo(1.0)
  })

  it('orthogonal vectors return 0.0', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0.0)
    expect(cosineSimilarity([1, 0, 0], [0, 1, 0])).toBeCloseTo(0.0)
  })

  it('opposite vectors return -1.0', () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1.0)
    expect(cosineSimilarity([1, 2, 3], [-1, -2, -3])).toBeCloseTo(-1.0)
  })

  it('known vectors return expected similarity', () => {
    // cos([3,4], [4,3]) = (12+12)/(5*5) = 24/25 = 0.96
    expect(cosineSimilarity([3, 4], [4, 3])).toBeCloseTo(0.96, 2)
  })

  it('zero vector throws DivisionByZeroError', () => {
    expect(() => cosineSimilarity([0, 0], [1, 0])).toThrow(DivisionByZeroError)
    expect(() => cosineSimilarity([1, 0], [0, 0])).toThrow(DivisionByZeroError)
    expect(() => cosineSimilarity([0, 0, 0], [0, 0, 0])).toThrow(DivisionByZeroError)
  })
})
