import request from 'supertest'
import app from '../src/app'
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

function mockAuthUser() {
  jest.mocked(jwt.verify).mockReturnValue({ userId: USER_ID, email: 'user@example.com', orgIds: [ORG_ID] } as any)
}

const now = new Date()
const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

describe('GET /plans', () => {
  test('1. returns 200 with array of 3 plans', async () => {
    const res = await request(app).get('/plans')

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.plans)).toBe(true)
    expect(res.body.plans).toHaveLength(3)
    const ids = res.body.plans.map((p: { id: string }) => p.id)
    expect(ids).toContain('free')
    expect(ids).toContain('pro')
    expect(ids).toContain('enterprise')
  })
})

describe('GET /orgs/:orgId/plan', () => {
  test('2. returns current plan', async () => {
    mockAuthUser()
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          org_id: ORG_ID,
          plan_id: 'pro',
          status: 'active',
          current_period_start: now,
          current_period_end: periodEnd,
        },
      ],
    })

    const res = await request(app)
      .get(`/orgs/${ORG_ID}/plan`)
      .set('Authorization', AUTH_HEADER)

    expect(res.status).toBe(200)
    expect(res.body.subscription.plan_id).toBe('pro')
    expect(res.body.subscription.plan).toBeDefined()
  })
})

describe('POST /orgs/:orgId/plan', () => {
  test('3. upgrade free→pro returns 200', async () => {
    mockAuthUser()
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // usage check for pro (has limit)
      .mockResolvedValueOnce({
        rows: [{ org_id: ORG_ID, plan_id: 'pro', status: 'active', current_period_start: now, current_period_end: periodEnd }],
      }) // upsert

    const res = await request(app)
      .post(`/orgs/${ORG_ID}/plan`)
      .set('Authorization', AUTH_HEADER)
      .send({ planId: 'pro' })

    expect(res.status).toBe(200)
    expect(res.body.subscription.plan_id).toBe('pro')
  })

  test('4. upgrade pro→enterprise returns 200', async () => {
    mockAuthUser()
    // enterprise has null monthlyRequests, so no usage check
    mockQuery.mockResolvedValueOnce({
      rows: [{ org_id: ORG_ID, plan_id: 'enterprise', status: 'active', current_period_start: now, current_period_end: periodEnd }],
    }) // upsert

    const res = await request(app)
      .post(`/orgs/${ORG_ID}/plan`)
      .set('Authorization', AUTH_HEADER)
      .send({ planId: 'enterprise' })

    expect(res.status).toBe(200)
    expect(res.body.subscription.plan_id).toBe('enterprise')
  })

  test('5. downgrade blocked when usage exceeds new limit returns 400', async () => {
    mockAuthUser()
    // free plan has limit of 1000, usage is 5000
    mockQuery.mockResolvedValueOnce({ rows: [{ total: '5000' }] }) // usage check

    const res = await request(app)
      .post(`/orgs/${ORG_ID}/plan`)
      .set('Authorization', AUTH_HEADER)
      .send({ planId: 'free' })

    expect(res.status).toBe(400)
  })

  test('6. invalid planId returns 422', async () => {
    mockAuthUser()

    const res = await request(app)
      .post(`/orgs/${ORG_ID}/plan`)
      .set('Authorization', AUTH_HEADER)
      .send({ planId: 'nonexistent_plan' })

    expect(res.status).toBe(422)
  })
})

describe('Plans constants', () => {
  test('7. PLANS.pro.monthlyRequests > PLANS.free.monthlyRequests', () => {
    expect(PLANS.pro.monthlyRequests).toBeGreaterThan(PLANS.free.monthlyRequests!)
  })
})
