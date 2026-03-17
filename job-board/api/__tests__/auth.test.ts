jest.mock('../src/config/database')
jest.mock('jsonwebtoken')
jest.mock('bcryptjs')

import { getPool } from '../src/config/database'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import request from 'supertest'
import { createApp } from '../src/app'

const mockQuery = jest.fn()
const app = createApp()

beforeEach(() => {
  jest.mocked(getPool).mockReturnValue({ query: mockQuery } as any)
  mockQuery.mockReset()
  jest.mocked(jwt.verify).mockReset()
  jest.mocked(jwt.sign).mockReturnValue('mock.jwt.token' as any)
  jest.mocked(bcrypt.hash).mockResolvedValue('hashed_password' as never)
  jest.mocked(bcrypt.compare).mockResolvedValue(true as never)
})

describe('POST /auth/register', () => {
  it('registers an applicant and returns 201 with role:applicant', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // email check
      .mockResolvedValueOnce({
        rows: [{ id: 1, email: 'user@test.com', name: 'Test User', role: 'applicant', created_at: new Date() }]
      }) // insert

    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'user@test.com', password: 'password123', name: 'Test User' })

    expect(res.status).toBe(201)
    expect(res.body.user.role).toBe('applicant')
    expect(res.body.token).toBeDefined()
  })

  it('registers an employer and returns 201 with role:employer', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ id: 2, email: 'employer@test.com', name: 'Employer', role: 'employer', created_at: new Date() }]
      })

    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'employer@test.com', password: 'password123', name: 'Employer', role: 'employer' })

    expect(res.status).toBe(201)
    expect(res.body.user.role).toBe('employer')
  })

  it('returns 409 for duplicate email', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] }) // email exists

    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'existing@test.com', password: 'password123', name: 'Test User' })

    expect(res.status).toBe(409)
  })

  it('returns 422 for missing required fields', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'user@test.com' }) // missing password and name

    expect(res.status).toBe(422)
  })
})

describe('POST /auth/login', () => {
  it('returns 200 with token containing role claim', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 1,
        email: 'user@test.com',
        name: 'Test User',
        role: 'applicant',
        password_hash: 'hashed_password'
      }]
    })

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'user@test.com', password: 'password123' })

    expect(res.status).toBe(200)
    expect(res.body.token).toBeDefined()
    expect(jwt.sign).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'applicant' }),
      expect.any(String),
      expect.any(Object)
    )
  })

  it('returns 401 for wrong password', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 1,
        email: 'user@test.com',
        role: 'applicant',
        password_hash: 'hashed_password'
      }]
    })
    jest.mocked(bcrypt.compare).mockResolvedValue(false as never)

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'user@test.com', password: 'wrongpassword' })

    expect(res.status).toBe(401)
  })
})
