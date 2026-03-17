import { getPool } from '../../config/database'
import { getOpenAIClient } from '../../config/openai'

export interface ChatSource {
  title: string
  similarity: number
}

export interface ChatResponse {
  answer: string
  sources: ChatSource[]
}

export interface DbChunk {
  content: string
  title: string
  similarity: number
}

export async function chat(userId: number, query: string): Promise<ChatResponse> {
  const pool = getPool()
  const client = getOpenAIClient()

  // 1. Embed the query
  const { data } = await (client as any).embeddings.create({
    input: query,
    model: 'text-embedding-ada-002',
  })
  const queryVector: number[] = data[0].embedding

  // 2. Similarity search via pgvector cosine distance operator (<=>)
  const { rows: chunks } = await pool.query(
    `SELECT dc.content, d.title, 1 - (dc.embedding <=> $1::vector) AS similarity
     FROM document_chunks dc
     JOIN documents d ON d.id = dc.document_id
     WHERE d.user_id = $2
       AND 1 - (dc.embedding <=> $1::vector) > 0.7
     ORDER BY dc.embedding <=> $1::vector
     LIMIT 3`,
    [JSON.stringify(queryVector), userId]
  )

  // 3. Build context string from retrieved chunks
  const context = (chunks as DbChunk[])
    .map((c) => `[${c.title}]: ${c.content}`)
    .join('\n\n')

  const systemPrompt = context
    ? `You are a helpful assistant. Answer the user's question using only the following context:\n\n${context}`
    : 'You are a helpful assistant. No relevant documents were found. Let the user know politely that no context is available.'

  // 4. Call LLM
  const { choices } = await (client as any).chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: query },
    ],
  })

  return {
    answer: choices[0].message.content as string,
    sources: (chunks as DbChunk[]).map((c) => ({
      title: c.title,
      similarity: c.similarity,
    })),
  }
}
