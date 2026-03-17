import request from 'supertest'
import app from '../src/app'

jest.mock('../src/config/database')
import { getPool } from '../src/config/database'

const mockQuery = jest.fn()

beforeEach(() => {
  jest.mocked(getPool).mockReturnValue({ query: mockQuery } as any)
  mockQuery.mockReset()
})

// Mock bcryptjs so we don't do real hashing in tests
jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('hashed_password'),
  compare: jest.fn(),
}))
import bcrypt from 'bcryptjs'

// Mock jsonwebtoken
jest.mock('jsonwebtoken', () => ({
  sign: jest.fn().mockReturnValue('mock_jwt_token'),
  verify: jest.fn(),
}))
import jwt from 'jsonwebtoken'

describe('POST /auth/register', () => {
  test('1. returns 201 with user (no password field)', async () => {
    // No existing user
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // SELECT existing
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'user-1',
            email: 'alice@example.com',
            name: 'Alice',
            created_at: new Date(),
          },
        ],
      }) // INSERT

    const res = await request(app).post('/auth/register').send({
      email: 'alice@example.com',
      password: 'password123',
      name: 'Alice',
    })

    expect(res.status).toBe(201)
    expect(res.body.user).toBeDefined()
    expect(res.body.user.password).toBeUndefined()
    expect(res.body.user.password_hash).toBeUndefined()
    expect(res.body.user.email).toBe('alice@example.com')
  })

  test('2. duplicate email returns 409', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'existing-user' }] })

    const res = await request(app).post('/auth/register').send({
      email: 'existing@example.com',
      password: 'password123',
      name: 'Bob',
    })

    expect(res.status).toBe(409)
    expect(res.body.error).toBeDefined()
  })

  test('3. missing required fields returns 422', async () => {
    const res = await request(app).post('/auth/register').send({
      email: 'incomplete@example.com',
      // missing password and name
    })

    expect(res.status).toBe(422)
  })
})

describe('POST /auth/login', () => {
  test('4. valid credentials return 200 with token', async () => {
    jest.mocked(bcrypt.compare as jest.Mock).mockResolvedValue(true)
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'user-1',
            email: 'alice@example.com',
            name: 'Alice',
            password_hash: 'hashed_password',
            created_at: new Date(),
          },
        ],
      }) // SELECT user
      .mockResolvedValueOnce({ rows: [] }) // SELECT org_members

    const res = await request(app).post('/auth/login').send({
      email: 'alice@example.com',
      password: 'password123',
    })

    expect(res.status).toBe(200)
    expect(res.body.token).toBeDefined()
    expect(res.body.user).toBeDefined()
    expect(res.body.user.password_hash).toBeUndefined()
  })

  test('5. wrong password returns 401', async () => {
    jest.mocked(bcrypt.compare as jest.Mock).mockResolvedValue(false)
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'user-1',
          email: 'alice@example.com',
          name: 'Alice',
          password_hash: 'hashed_password',
          created_at: new Date(),
        },
      ],
    })

    const res = await request(app).post('/auth/login').send({
      email: 'alice@example.com',
      password: 'wrongpassword',
    })

    expect(res.status).toBe(401)
  })

  test('6. unknown email returns 401', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] })

    const res = await request(app).post('/auth/login').send({
      email: 'nobody@example.com',
      password: 'password123',
    })

    expect(res.status).toBe(401)
  })
})

describe('POST /auth/logout', () => {
  test('7. valid token returns 200', async () => {
    jest.mocked(jwt.verify).mockReturnValue({
      userId: 'user-1',
      email: 'alice@example.com',
      orgIds: [],
    } as any)

    const res = await request(app)
      .post('/auth/logout')
      .set('Authorization', 'Bearer mock_jwt_token')

    expect(res.status).toBe(200)
    expect(res.body.message).toBeDefined()
  })
})
