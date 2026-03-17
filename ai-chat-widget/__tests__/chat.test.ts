/**
 * Chat endpoint tests — mock DB and OpenAI.
 */
import request from 'supertest'
import jwt from 'jsonwebtoken'

jest.mock('../src/config/database', () => require('../src/config/__mocks__/database'))
jest.mock('../src/config/openai', () => ({
  getOpenAIClient: jest.fn(),
  resetOpenAIClient: jest.fn(),
}))

import { createApp } from '../src/app'
import { mockQuery } from '../src/config/__mocks__/database'
import * as openaiConfig from '../src/config/openai'

const JWT_SECRET = 'dev-secret-change-in-production'

function makeToken(userId = 1, email = 'user@example.com') {
  return jwt.sign({ id: userId, email }, JWT_SECRET, { expiresIn: '1h' })
}

function makeEmbedding(seed = 42) {
  return Array.from({ length: 1536 }, (_: unknown, i: number) => Math.sin(seed + i) * 0.1)
}

let mockEmbeddingsCreate: jest.Mock
let mockChatCreate: jest.Mock

function setupOpenAIMock(chunks: Array<{ content: string; title: string; similarity: number }> = []) {
  mockEmbeddingsCreate = jest.fn().mockResolvedValue({
    data: [{ embedding: makeEmbedding(), index: 0 }],
    model: 'text-embedding-ada-002',
    usage: { prompt_tokens: 10, total_tokens: 10 },
  })

  mockChatCreate = jest.fn().mockResolvedValue({
    id: 'chatcmpl-mock',
    choices: [
      {
        message: { role: 'assistant', content: 'This is a mock response based on the provided context.' },
        finish_reason: 'stop',
        index: 0,
      },
    ],
    model: 'gpt-4o-mini',
    usage: { prompt_tokens: 50, completion_tokens: 20, total_tokens: 70 },
  })

  ;(openaiConfig.getOpenAIClient as jest.Mock).mockReturnValue({
    embeddings: { create: mockEmbeddingsCreate },
    chat: { completions: { create: mockChatCreate } },
  })

  // Mock DB similarity search returning `chunks`
  mockQuery.mockResolvedValue({ rows: chunks })
}

const app = createApp()

beforeEach(() => {
  jest.clearAllMocks()
})

describe('POST /chat', () => {
  it('valid request returns 200 with answer and sources', async () => {
    setupOpenAIMock([{ content: 'Relevant doc content.', title: 'Doc 1', similarity: 0.92 }])

    const res = await request(app)
      .post('/chat')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ query: 'What is the answer?' })

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('answer')
    expect(res.body).toHaveProperty('sources')
    expect(typeof res.body.answer).toBe('string')
    expect(Array.isArray(res.body.sources)).toBe(true)
  })

  it('empty query returns 422', async () => {
    const res = await request(app)
      .post('/chat')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ query: '' })

    expect(res.status).toBe(422)
  })

  it('no auth token returns 401', async () => {
    const res = await request(app)
      .post('/chat')
      .send({ query: 'Hello?' })

    expect(res.status).toBe(401)
  })

  it('returns top-3 sources when available', async () => {
    const chunks = [
      { content: 'Content 1', title: 'Doc A', similarity: 0.95 },
      { content: 'Content 2', title: 'Doc B', similarity: 0.88 },
      { content: 'Content 3', title: 'Doc C', similarity: 0.82 },
    ]
    setupOpenAIMock(chunks)

    const res = await request(app)
      .post('/chat')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ query: 'Tell me about docs' })

    expect(res.status).toBe(200)
    expect(res.body.sources).toHaveLength(3)
    expect(res.body.sources[0]).toHaveProperty('title', 'Doc A')
    expect(res.body.sources[0]).toHaveProperty('similarity', 0.95)
  })

  it('with no docs returns graceful response without error', async () => {
    setupOpenAIMock([]) // no chunks returned

    const res = await request(app)
      .post('/chat')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ query: 'What do you know?' })

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('answer')
    expect(res.body.sources).toHaveLength(0)
  })

  it('embedding is called exactly once per request', async () => {
    setupOpenAIMock([])

    await request(app)
      .post('/chat')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ query: 'Single request embedding count' })

    expect(mockEmbeddingsCreate).toHaveBeenCalledTimes(1)
  })

  it('similarity threshold filters low-similarity chunks (mock returns empty)', async () => {
    // The SQL WHERE clause filters < 0.7 — we mock DB to return only high-sim results
    // When mock returns empty, sources should be empty
    setupOpenAIMock([])

    const res = await request(app)
      .post('/chat')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ query: 'Low similarity query' })

    expect(res.status).toBe(200)
    expect(res.body.sources).toHaveLength(0)
  })

  it('LLM system prompt includes retrieved context', async () => {
    const chunks = [{ content: 'Important context data.', title: 'Knowledge Base', similarity: 0.91 }]
    setupOpenAIMock(chunks)

    await request(app)
      .post('/chat')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ query: 'What is the context?' })

    expect(mockChatCreate).toHaveBeenCalledTimes(1)
    const callArgs = mockChatCreate.mock.calls[0][0]
    const systemMessage = callArgs.messages.find((m: { role: string }) => m.role === 'system')
    expect(systemMessage).toBeDefined()
    expect(systemMessage.content).toContain('Knowledge Base')
    expect(systemMessage.content).toContain('Important context data.')
  })

  it('query length > 2000 chars returns 422', async () => {
    const longQuery = 'a'.repeat(2001)
    const res = await request(app)
      .post('/chat')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ query: longQuery })

    expect(res.status).toBe(422)
  })
})
