/**
 * Documents endpoint tests — mock DB and OpenAI.
 */
import request from 'supertest'
import jwt from 'jsonwebtoken'

// Must mock before importing app
jest.mock('../src/config/database', () => require('../src/config/__mocks__/database'))
jest.mock('../src/config/openai', () => ({
  getOpenAIClient: jest.fn(),
  resetOpenAIClient: jest.fn(),
}))

import { createApp } from '../src/app'
import { mockQuery } from '../src/config/__mocks__/database'
import * as openaiConfig from '../src/config/openai'

const JWT_SECRET = 'dev-secret-change-in-production'

function makeToken(userId = 1, email = 'test@example.com') {
  return jwt.sign({ id: userId, email }, JWT_SECRET, { expiresIn: '1h' })
}

function makeEmbedding(seed = 0) {
  return Array.from({ length: 1536 }, (_: unknown, i: number) => Math.sin(seed + i) * 0.1)
}

function setupOpenAIMock() {
  const mockCreate = jest.fn().mockResolvedValue({
    data: [{ embedding: makeEmbedding(), index: 0 }],
    model: 'text-embedding-ada-002',
    usage: { prompt_tokens: 10, total_tokens: 10 },
  })
  ;(openaiConfig.getOpenAIClient as jest.Mock).mockReturnValue({
    embeddings: { create: mockCreate },
  })
  return mockCreate
}

const app = createApp()

beforeEach(() => {
  jest.clearAllMocks()
})

describe('POST /documents', () => {
  it('valid request returns 201 with id and chunkCount', async () => {
    setupOpenAIMock()

    const doc = {
      id: 1,
      user_id: 1,
      title: 'Test Doc',
      content: 'Some content here. More content follows.',
      created_at: new Date(),
      updated_at: new Date(),
    }

    // First query: INSERT document RETURNING *
    mockQuery
      .mockResolvedValueOnce({ rows: [doc] })
      // Second query: INSERT chunk
      .mockResolvedValue({ rows: [] })

    const res = await request(app)
      .post('/documents')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ title: 'Test Doc', content: 'Some content here. More content follows.' })

    expect(res.status).toBe(201)
    expect(res.body).toHaveProperty('id', 1)
    expect(res.body).toHaveProperty('chunkCount')
    expect(typeof res.body.chunkCount).toBe('number')
  })

  it('empty content returns 422', async () => {
    const res = await request(app)
      .post('/documents')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ title: 'Test', content: '' })

    expect(res.status).toBe(422)
  })

  it('no auth token returns 401', async () => {
    const res = await request(app)
      .post('/documents')
      .send({ title: 'Test', content: 'some content' })

    expect(res.status).toBe(401)
  })
})

describe('GET /documents', () => {
  it('returns 200 with list of documents', async () => {
    const docs = [
      { id: 1, user_id: 1, title: 'Doc 1', created_at: new Date(), updated_at: new Date() },
      { id: 2, user_id: 1, title: 'Doc 2', created_at: new Date(), updated_at: new Date() },
    ]
    mockQuery.mockResolvedValueOnce({ rows: docs })

    const res = await request(app)
      .get('/documents')
      .set('Authorization', `Bearer ${makeToken()}`)

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body).toHaveLength(2)
  })
})

describe('GET /documents/:id', () => {
  it('own document returns 200', async () => {
    const doc = {
      id: 5,
      user_id: 1,
      title: 'My Doc',
      content: 'Content here.',
      created_at: new Date(),
      updated_at: new Date(),
    }
    mockQuery.mockResolvedValueOnce({ rows: [doc] })

    const res = await request(app)
      .get('/documents/5')
      .set('Authorization', `Bearer ${makeToken(1)}`)

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('id', 5)
  })

  it('another user document returns 404', async () => {
    // Document belongs to user_id=2, but requester is user 1
    const doc = {
      id: 5,
      user_id: 2,
      title: 'Other Doc',
      content: 'Content.',
      created_at: new Date(),
      updated_at: new Date(),
    }
    mockQuery.mockResolvedValueOnce({ rows: [doc] })

    const res = await request(app)
      .get('/documents/5')
      .set('Authorization', `Bearer ${makeToken(1)}`)

    expect(res.status).toBe(404)
  })
})

describe('DELETE /documents/:id', () => {
  it('own document returns 204', async () => {
    const doc = { id: 3, user_id: 1 }
    mockQuery
      .mockResolvedValueOnce({ rows: [doc] })
      .mockResolvedValueOnce({ rows: [] }) // DELETE

    const res = await request(app)
      .delete('/documents/3')
      .set('Authorization', `Bearer ${makeToken(1)}`)

    expect(res.status).toBe(204)
  })

  it('another user document returns 404', async () => {
    const doc = { id: 3, user_id: 2 }
    mockQuery.mockResolvedValueOnce({ rows: [doc] })

    const res = await request(app)
      .delete('/documents/3')
      .set('Authorization', `Bearer ${makeToken(1)}`)

    expect(res.status).toBe(404)
  })
})
