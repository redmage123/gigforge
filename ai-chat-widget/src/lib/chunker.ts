/**
 * Splits text into overlapping chunks for embedding.
 * Uses sentence boundaries when possible, falls back to character splitting.
 */
export function chunkText(text: string, maxChars = 500, overlap = 50): string[] {
  if (!text.trim()) return []

  const sentences = text.match(/[^.!?]+[.!?]+/g) ?? [text]
  const chunks: string[] = []
  let current = ''

  for (const sentence of sentences) {
    if (current.length + sentence.length > maxChars && current) {
      chunks.push(current.trim())
      // overlap: take last `overlap` chars of current as context for next chunk
      current = current.slice(-overlap) + sentence
    } else {
      current += sentence
    }
  }

  if (current.trim()) chunks.push(current.trim())

  return chunks
}
