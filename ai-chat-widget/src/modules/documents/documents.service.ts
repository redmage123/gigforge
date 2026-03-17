import { getPool } from '../../config/database'
import { getOpenAIClient } from '../../config/openai'
import { chunkText } from '../../lib/chunker'
import { NotFoundError } from '../../types/errors'

export interface Document {
  id: number
  user_id: number
  title: string
  content: string
  created_at: Date
  updated_at: Date
}

export interface DocumentWithChunkCount extends Document {
  chunkCount: number
}

export async function ingestDocument(
  userId: number,
  title: string,
  content: string
): Promise<DocumentWithChunkCount> {
  const pool = getPool()

  // 1. Insert document record
  const { rows: [doc] } = await pool.query(
    'INSERT INTO documents (user_id, title, content) VALUES ($1, $2, $3) RETURNING *',
    [userId, title, content]
  )

  // 2. Chunk the content
  const chunks = chunkText(content)

  // 3. Embed each chunk and store
  const client = getOpenAIClient()
  for (const [i, chunk] of chunks.entries()) {
    const { data } = await (client as any).embeddings.create({
      input: chunk,
      model: 'text-embedding-ada-002',
    })
    const vector = data[0].embedding
    await pool.query(
      'INSERT INTO document_chunks (document_id, content, embedding, chunk_index) VALUES ($1, $2, $3::vector, $4)',
      [doc.id, chunk, JSON.stringify(vector), i]
    )
  }

  return { ...(doc as Document), chunkCount: chunks.length }
}

export async function listDocuments(userId: number): Promise<Document[]> {
  const pool = getPool()
  const { rows } = await pool.query(
    'SELECT id, user_id, title, created_at, updated_at FROM documents WHERE user_id = $1 ORDER BY created_at DESC',
    [userId]
  )
  return rows as Document[]
}

export async function getDocumentById(
  userId: number,
  documentId: number
): Promise<Document> {
  const pool = getPool()
  const { rows } = await pool.query(
    'SELECT * FROM documents WHERE id = $1',
    [documentId]
  )

  if (rows.length === 0 || (rows[0] as Document).user_id !== userId) {
    throw new NotFoundError('Document not found')
  }

  return rows[0] as Document
}

export async function deleteDocument(
  userId: number,
  documentId: number
): Promise<void> {
  const pool = getPool()
  const { rows } = await pool.query(
    'SELECT id, user_id FROM documents WHERE id = $1',
    [documentId]
  )

  if (rows.length === 0 || (rows[0] as { user_id: number }).user_id !== userId) {
    throw new NotFoundError('Document not found')
  }

  // Chunks are deleted via CASCADE in the DB schema
  await pool.query('DELETE FROM documents WHERE id = $1', [documentId])
}
