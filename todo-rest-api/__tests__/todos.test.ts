jest.mock('../src/config/database')
jest.mock('jsonwebtoken')

import request from 'supertest'
import { createApp } from '../src/app'
import { getPool } from '../src/config/database'
import jwt from 'jsonwebtoken'

const mockQuery = jest.fn()

const mockUser = { id: 1, email: 'alice@test.com' }

const mockTodo = {
  id: 1,
  user_id: 1,
  title: 'Buy groceries',
  completed: false,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
}

beforeEach(() => {
  jest.mocked(getPool).mockReturnValue({ query: mockQuery } as any)
  mockQuery.mockReset()
  // Default jwt.verify returns a valid user payload
  jest.mocked(jwt.verify).mockReturnValue(mockUser as any)
})

const app = createApp()

const authHeader = { Authorization: 'Bearer valid-token' }

describe('GET /todos', () => {
  it('returns 200 with array of authenticated user todos', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // blacklist check in authenticate
      .mockResolvedValueOnce({ rows: [mockTodo] }) // SELECT todos

    const res = await request(app).get('/todos').set(authHeader)

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body).toHaveLength(1)
    expect(res.body[0]).toHaveProperty('title', 'Buy groceries')
    expect(res.body[0]).toHaveProperty('user_id', 1)
  })

  it('returns 200 with empty array when user has no todos', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // blacklist check
      .mockResolvedValueOnce({ rows: [] }) // SELECT todos returns empty

    const res = await request(app).get('/todos').set(authHeader)

    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })

  it('returns 401 when no auth token provided', async () => {
    const res = await request(app).get('/todos')

    expect(res.status).toBe(401)
  })
})

describe('POST /todos', () => {
  it('returns 201 with created todo', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // blacklist check
      .mockResolvedValueOnce({ rows: [mockTodo] }) // INSERT todo

    const res = await request(app)
      .post('/todos')
      .set(authHeader)
      .send({ title: 'Buy groceries' })

    expect(res.status).toBe(201)
    expect(res.body).toHaveProperty('id')
    expect(res.body).toHaveProperty('title', 'Buy groceries')
    expect(res.body).toHaveProperty('completed', false)
  })

  it('returns 422 when title is missing', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }) // blacklist check

    const res = await request(app).post('/todos').set(authHeader).send({})

    expect(res.status).toBe(422)
    expect(res.body.error).toBeDefined()
  })

  it('returns 422 when title exceeds 255 characters', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }) // blacklist check

    const longTitle = 'a'.repeat(256)
    const res = await request(app)
      .post('/todos')
      .set(authHeader)
      .send({ title: longTitle })

    expect(res.status).toBe(422)
    expect(res.body.error).toBeDefined()
  })
})

describe('GET /todos/:id', () => {
  it('returns 200 with todo when it belongs to the authenticated user', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // blacklist check
      .mockResolvedValueOnce({ rows: [mockTodo] }) // SELECT todo by id and user_id

    const res = await request(app).get('/todos/1').set(authHeader)

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('id', 1)
    expect(res.body).toHaveProperty('title', 'Buy groceries')
  })

  it('returns 404 (not 403) when todo belongs to a different user', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // blacklist check
      .mockResolvedValueOnce({ rows: [] }) // SELECT returns no rows (ownership guard)

    const res = await request(app).get('/todos/99').set(authHeader)

    expect(res.status).toBe(404)
  })

  it('returns 404 when todo does not exist', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // blacklist check
      .mockResolvedValueOnce({ rows: [] }) // SELECT returns no rows

    const res = await request(app).get('/todos/9999').set(authHeader)

    expect(res.status).toBe(404)
  })
})

describe('PUT /todos/:id', () => {
  it('returns 200 with updated todo when user owns it', async () => {
    const updatedTodo = { ...mockTodo, title: 'Buy organic groceries', completed: true }

    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // blacklist check
      .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // ownership check
      .mockResolvedValueOnce({ rows: [updatedTodo] }) // UPDATE

    const res = await request(app)
      .put('/todos/1')
      .set(authHeader)
      .send({ title: 'Buy organic groceries', completed: true })

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('title', 'Buy organic groceries')
    expect(res.body).toHaveProperty('completed', true)
  })

  it('returns 404 when todo belongs to a different user', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // blacklist check
      .mockResolvedValueOnce({ rows: [] }) // ownership check returns no rows

    const res = await request(app)
      .put('/todos/99')
      .set(authHeader)
      .send({ title: 'Updated title' })

    expect(res.status).toBe(404)
  })

  it('returns 422 when body is invalid (title too long)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }) // blacklist check

    const longTitle = 'a'.repeat(256)
    const res = await request(app)
      .put('/todos/1')
      .set(authHeader)
      .send({ title: longTitle })

    expect(res.status).toBe(422)
    expect(res.body.error).toBeDefined()
  })
})

describe('DELETE /todos/:id', () => {
  it('returns 204 when todo deleted successfully', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // blacklist check
      .mockResolvedValueOnce({ rowCount: 1 }) // DELETE

    const res = await request(app).delete('/todos/1').set(authHeader)

    expect(res.status).toBe(204)
    expect(res.body).toEqual({})
  })

  it('returns 404 when todo belongs to a different user', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // blacklist check
      .mockResolvedValueOnce({ rowCount: 0 }) // DELETE finds no matching row

    const res = await request(app).delete('/todos/99').set(authHeader)

    expect(res.status).toBe(404)
  })
})
