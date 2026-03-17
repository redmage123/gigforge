import { getOpenAIClient } from '../config/openai'

export interface EmbeddingResult {
  embedding: number[]
  tokenCount: number
}

/**
 * Get embedding vector for a single text string.
 */
export async function getEmbedding(text: string): Promise<number[]> {
  const client = getOpenAIClient()
  const response = await (client as any).embeddings.create({
    input: text,
    model: 'text-embedding-ada-002',
  })
  return response.data[0].embedding as number[]
}

/**
 * Get embeddings for multiple texts in a single API call.
 */
export async function getBatchEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return []

  const client = getOpenAIClient()
  const response = await (client as any).embeddings.create({
    input: texts,
    model: 'text-embedding-ada-002',
  })

  // Sort by index to ensure correct ordering
  const sorted = [...(response.data as Array<{ embedding: number[]; index: number }>)].sort(
    (a, b) => a.index - b.index
  )
  return sorted.map((d) => d.embedding)
}
