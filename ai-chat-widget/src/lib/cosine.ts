export class DivisionByZeroError extends Error {
  constructor(message = 'Cannot compute cosine similarity of zero vector') {
    super(message)
    this.name = 'DivisionByZeroError'
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

/**
 * Computes cosine similarity between two numeric vectors.
 * Returns a value in [-1, 1].
 * Throws DivisionByZeroError if either vector is the zero vector.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  const dot = a.reduce((sum, ai, i) => sum + ai * (b[i] ?? 0), 0)
  const magA = Math.sqrt(a.reduce((sum, ai) => sum + ai * ai, 0))
  const magB = Math.sqrt(b.reduce((sum, bi) => sum + bi * bi, 0))

  if (magA === 0 || magB === 0) {
    throw new DivisionByZeroError('Cannot compute cosine similarity of zero vector')
  }

  return dot / (magA * magB)
}
