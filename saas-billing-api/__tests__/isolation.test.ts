import request from 'supertest'
import app from '../src/app'

jest.mock('../src/config/database')
import { getPool } from '../src/config/database'

const mockQuery = jest.fn()

beforeEach(() => {
  jest.mocked(getPool).mockReturnValue({ query: mockQuery } as any)
  mockQuery.mockReset()
})

jest.mock('jsonwebtoken', () => ({
  sign: jest.fn().mockReturnValue('mock_token'),
  verify: jest.fn(),
}))
import jwt from 'jsonwebtoken'

const AUTH_HEADER = 'Bearer mock_token'
const ORG_A = 'org-a'
const ORG_B = 'org-b'
const USER_A = 'user-a'

// User A belongs only to ORG_A
function mockUserA() {
  jest.mocked(jwt.verify).mockReturnValue({
    userId: USER_A,
    email: 'usera@example.com',
    orgIds: [ORG_A],
  } as any)
}

describe('Cross-org isolation', () => {
  test('1. user from orgA cannot GET orgB usage → 403', async () => {
    mockUserA()
    // DB membership check returns empty (user A is not in org B)
    mockQuery.mockResolvedValueOnce({ rows: [] })

    const res = await request(app)
      .get(`/orgs/${ORG_B}/usage`)
      .set('Authorization', AUTH_HEADER)

    expect(res.status).toBe(403)
  })

  test('2. user from orgA cannot POST orgB invoices/generate → 403', async () => {
    mockUserA()
    // DB membership check returns empty (user A is not in org B)
    mockQuery.mockResolvedValueOnce({ rows: [] })

    const res = await request(app)
      .post(`/orgs/${ORG_B}/invoices/generate`)
      .set('Authorization', AUTH_HEADER)

    expect(res.status).toBe(403)
  })

  test('3. user from orgA cannot POST orgB members → 403', async () => {
    mockUserA()
    // First membership check in invite handler: requestor not member of orgB
    mockQuery.mockResolvedValueOnce({ rows: [] })

    const res = await request(app)
      .post(`/orgs/${ORG_B}/members`)
      .set('Authorization', AUTH_HEADER)
      .send({ email: 'someone@example.com' })

    expect(res.status).toBe(403)
  })
})
