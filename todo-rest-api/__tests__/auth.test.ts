jest.mock('../src/config/database')
jest.mock('bcryptjs')
jest.mock('jsonwebtoken')

import request from 'supertest'
import { createApp } from '../src/app'
import { getPool } from '../src/config/database'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

const mockQuery = jest.fn()

beforeEach(() => {
  jest.mocked(getPool).mockReturnValue({ query: mockQuery } as any)
  mockQuery.mockReset()
  // Default jwt.sign mock
  jest.mocked(jwt.sign).mockReturnValue('mock-jwt-token' as any)
  // Default bcrypt.hash mock
  jest.mocked(bcrypt.hash).mockResolvedValue('hashed-password' as never)
})

const app = createApp()

describe('POST /auth/register', () => {
  it('returns 201 with user object (no password field) on success', async () => {
    // No existing user
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // SELECT existing user
      .mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            email: 'alice@test.com',
            name: 'Alice',
            created_at: '2026-01-01T00:00:00.000Z',
          },
        ],
      }) // INSERT user

    const res = await request(app).post('/auth/register').send({
      email: 'alice@test.com',
      password: 'password123',
      name: 'Alice',
    })

    expect(res.status).toBe(201)
    expect(res.body).toHaveProperty('token')
    expect(res.body).toHaveProperty('user')
    expect(res.body.user).toHaveProperty('id', 1)
    expect(res.body.user).toHaveProperty('email', 'alice@test.com')
    expect(res.body.user).not.toHaveProperty('password')
    expect(res.body.user).not.toHaveProperty('password_hash')
  })

  it('returns 409 when email already registered', async () => {
    // Existing user found
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] })

    const res = await request(app).post('/auth/register').send({
      email: 'existing@test.com',
      password: 'password123',
      name: 'Bob',
    })

    expect(res.status).toBe(409)
    expect(res.body.error.message).toMatch(/already registered/i)
  })

  it('returns 422 when email is missing', async () => {
    const res = await request(app).post('/auth/register').send({
      password: 'password123',
      name: 'Alice',
    })

    expect(res.status).toBe(422)
    expect(res.body.error).toBeDefined()
  })

  it('returns 422 when password is missing', async () => {
    const res = await request(app).post('/auth/register').send({
      email: 'alice@test.com',
      name: 'Alice',
    })

    expect(res.status).toBe(422)
    expect(res.body.error).toBeDefined()
  })

  it('returns 422 when password is less than 8 characters', async () => {
    const res = await request(app).post('/auth/register').send({
      email: 'alice@test.com',
      password: 'short',
      name: 'Alice',
    })

    expect(res.status).toBe(422)
    expect(res.body.error).toBeDefined()
  })
})

describe('POST /auth/login', () => {
  it('returns 200 with { token, user } on valid credentials', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 1,
          email: 'alice@test.com',
          name: 'Alice',
          password_hash: 'hashed-password',
        },
      ],
    })
    jest.mocked(bcrypt.compare).mockResolvedValue(true as never)

    const res = await request(app).post('/auth/login').send({
      email: 'alice@test.com',
      password: 'password123',
    })

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('token')
    expect(res.body).toHaveProperty('user')
    expect(res.body.user).toHaveProperty('email', 'alice@test.com')
    expect(res.body.user).not.toHaveProperty('password_hash')
  })

  it('returns 401 when password is wrong', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 1,
          email: 'alice@test.com',
          name: 'Alice',
          password_hash: 'hashed-password',
        },
      ],
    })
    jest.mocked(bcrypt.compare).mockResolvedValue(false as never)

    const res = await request(app).post('/auth/login').send({
      email: 'alice@test.com',
      password: 'wrongpassword',
    })

    expect(res.status).toBe(401)
    expect(res.body.error.message).toMatch(/invalid email or password/i)
  })

  it('returns 401 with same message when email is unknown', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] })

    const res = await request(app).post('/auth/login').send({
      email: 'unknown@test.com',
      password: 'password123',
    })

    expect(res.status).toBe(401)
    expect(res.body.error.message).toMatch(/invalid email or password/i)
  })

  it('returns 422 when body is missing required fields', async () => {
    const res = await request(app).post('/auth/login').send({})

    expect(res.status).toBe(422)
    expect(res.body.error).toBeDefined()
  })
})

describe('POST /auth/logout', () => {
  it('returns 200 and blacklists token when given valid Bearer token', async () => {
    // authenticate middleware: jwt.verify, blacklist check, then blacklistToken insert
    jest.mocked(jwt.verify).mockReturnValue({ id: 1, email: 'alice@test.com' } as any)
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // blacklist check in authenticate middleware
      .mockResolvedValueOnce({ rows: [] }) // INSERT into token_blacklist

    const res = await request(app)
      .post('/auth/logout')
      .set('Authorization', 'Bearer mock-jwt-token')

    expect(res.status).toBe(200)
    expect(res.body.message).toMatch(/logged out/i)

    // Verify blacklist insert was called
    const insertCall = mockQuery.mock.calls.find(
      (call) => typeof call[0] === 'string' && call[0].includes('INSERT INTO token_blacklist')
    )
    expect(insertCall).toBeDefined()
  })

  it('returns 401 when no Authorization header is provided', async () => {
    const res = await request(app).post('/auth/logout')

    expect(res.status).toBe(401)
  })
})
