import request from 'supertest'
import app from '../src/app'
import { calculateInvoiceTotal } from '../src/modules/invoices/invoices.service'
import { PLANS } from '../src/modules/plans/plans.constants'

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
const ORG_ID = 'org-1'
const USER_ID = 'user-1'

const now = new Date()
const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

function mockAuthUser(userId = USER_ID, orgIds = [ORG_ID]) {
  jest.mocked(jwt.verify).mockReturnValue({ userId, email: 'user@example.com', orgIds } as any)
}

describe('POST /orgs/:orgId/usage', () => {
  test('1. record event returns 201', async () => {
    mockAuthUser()
    mockQuery
      .mockResolvedValueOnce({ rows: [{ user_id: USER_ID }] }) // membership check
      .mockResolvedValueOnce({
        rows: [{ id: 'evt-1', org_id: ORG_ID, event_type: 'api_call', count: 10, created_at: new Date() }],
      })

    const res = await request(app)
      .post(`/orgs/${ORG_ID}/usage`)
      .set('Authorization', AUTH_HEADER)
      .send({ eventType: 'api_call', count: 10 })

    expect(res.status).toBe(201)
    expect(res.body.event).toBeDefined()
    expect(res.body.event.event_type).toBe('api_call')
  })

  test('2. invalid eventType (empty string) returns 422', async () => {
    mockAuthUser()

    const res = await request(app)
      .post(`/orgs/${ORG_ID}/usage`)
      .set('Authorization', AUTH_HEADER)
      .send({ eventType: '' })

    expect(res.status).toBe(422)
  })
})

describe('GET /orgs/:orgId/usage', () => {
  test('3. returns summary with used/limit/overage', async () => {
    mockAuthUser()
    mockQuery
      .mockResolvedValueOnce({ rows: [{ user_id: USER_ID }] }) // membership check
      .mockResolvedValueOnce({
        rows: [{ org_id: ORG_ID, plan_id: 'pro', status: 'active', current_period_start: now, current_period_end: periodEnd }],
      }) // subscription
      .mockResolvedValueOnce({ rows: [{ total: '500' }] }) // usage sum

    const res = await request(app)
      .get(`/orgs/${ORG_ID}/usage`)
      .set('Authorization', AUTH_HEADER)

    expect(res.status).toBe(200)
    expect(res.body.summary).toBeDefined()
    expect(res.body.summary.used).toBe(500)
    expect(res.body.summary.limit).toBe(50000)
    expect(res.body.summary.overage).toBe(0)
  })

  test('4. cross-org user returns 403', async () => {
    mockAuthUser('other-user', ['other-org'])
    mockQuery.mockResolvedValueOnce({ rows: [] }) // no membership

    const res = await request(app)
      .get(`/orgs/${ORG_ID}/usage`)
      .set('Authorization', AUTH_HEADER)

    expect(res.status).toBe(403)
  })

  test('8. GET /orgs/:orgId/usage returns billing period dates', async () => {
    mockAuthUser()
    mockQuery
      .mockResolvedValueOnce({ rows: [{ user_id: USER_ID }] }) // membership check
      .mockResolvedValueOnce({
        rows: [{ org_id: ORG_ID, plan_id: 'pro', status: 'active', current_period_start: now, current_period_end: periodEnd }],
      }) // subscription
      .mockResolvedValueOnce({ rows: [{ total: '100' }] }) // usage sum

    const res = await request(app)
      .get(`/orgs/${ORG_ID}/usage`)
      .set('Authorization', AUTH_HEADER)

    expect(res.status).toBe(200)
    expect(res.body.summary.billing_period_start).toBeDefined()
    expect(res.body.summary.billing_period_end).toBeDefined()
  })
})

describe('Usage calculations', () => {
  test('5. usage under limit: overageAmount = 0', () => {
    const result = calculateInvoiceTotal(PLANS.pro, 1000)
    expect(result.overageAmount).toBe(0)
  })

  test('6. usage at limit: overageAmount = 0', () => {
    const result = calculateInvoiceTotal(PLANS.pro, PLANS.pro.monthlyRequests)
    expect(result.overageAmount).toBe(0)
  })

  test('7. usage over limit (pro, 60000 requests): overageAmount = Math.ceil(10000 * 0.1)', () => {
    const result = calculateInvoiceTotal(PLANS.pro, 60000)
    const expected = Math.ceil(10000 * PLANS.pro.overageRateCents)
    expect(result.overageAmount).toBe(expected)
  })
})
