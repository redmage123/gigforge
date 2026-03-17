jest.mock('../src/config/database')
jest.mock('jsonwebtoken')

import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { getPool } from '../src/config/database'
import { authenticate } from '../src/middleware/authenticate'
import { validate } from '../src/middleware/validate'
import { z } from 'zod'

const mockQuery = jest.fn()

beforeEach(() => {
  jest.mocked(getPool).mockReturnValue({ query: mockQuery } as any)
  mockQuery.mockReset()
})

function mockReqResNext(overrides: Partial<Request> = {}) {
  const req = {
    headers: {},
    ...overrides,
  } as unknown as Request

  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as Response

  const next = jest.fn() as NextFunction

  return { req, res, next }
}

describe('authenticate middleware', () => {
  it('calls next() and sets req.user when JWT is valid and not blacklisted', async () => {
    const payload = { id: 1, email: 'alice@test.com' }
    jest.mocked(jwt.verify).mockReturnValue(payload as any)
    mockQuery.mockResolvedValueOnce({ rows: [] }) // not blacklisted

    const { req, res, next } = mockReqResNext({
      headers: { authorization: 'Bearer valid-token' },
    })

    await authenticate(req, res, next)

    expect(next).toHaveBeenCalledWith() // called with no args = success
    expect(req.user).toEqual({ id: 1, email: 'alice@test.com' })
  })

  it('calls next() with UnauthorizedError when token is blacklisted', async () => {
    const payload = { id: 1, email: 'alice@test.com' }
    jest.mocked(jwt.verify).mockReturnValue(payload as any)
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 5 }] }) // blacklisted

    const { req, res, next } = mockReqResNext({
      headers: { authorization: 'Bearer blacklisted-token' },
    })

    await authenticate(req, res, next)

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 401 })
    )
  })

  it('calls next() with UnauthorizedError when token is expired (jwt throws TokenExpiredError)', async () => {
    const tokenExpiredError = new Error('jwt expired')
    tokenExpiredError.name = 'TokenExpiredError'
    jest.mocked(jwt.verify).mockImplementation(() => {
      throw tokenExpiredError
    })

    const { req, res, next } = mockReqResNext({
      headers: { authorization: 'Bearer expired-token' },
    })

    await authenticate(req, res, next)

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 401 })
    )
  })
})

describe('validate middleware', () => {
  it('returns 422 with errors array when zod schema validation fails', () => {
    const schema = z.object({
      title: z.string().min(1, 'Title is required'),
      count: z.number({ required_error: 'Count is required' }),
    })

    const middleware = validate(schema)

    const req = {
      body: { title: '', extra: 'ignored' },
    } as unknown as Request

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    } as unknown as Response

    const next = jest.fn() as NextFunction

    middleware(req, res, next)

    expect(res.status).toHaveBeenCalledWith(422)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          message: 'Validation error',
          status: 422,
          errors: expect.arrayContaining([
            expect.objectContaining({ message: expect.any(String) }),
          ]),
        }),
      })
    )
    expect(next).not.toHaveBeenCalled()
  })
})
