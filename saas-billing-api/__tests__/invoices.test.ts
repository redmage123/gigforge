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
const OTHER_ORG_ID = 'org-other'
const USER_ID = 'user-1'
const INVOICE_ID = 'invoice-1'

const now = new Date()
const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

function mockAuthUser(userId = USER_ID) {
  jest.mocked(jwt.verify).mockReturnValue({ userId, email: 'user@example.com', orgIds: [ORG_ID] } as any)
}

const sampleInvoice = {
  id: INVOICE_ID,
  org_id: ORG_ID,
  plan_id: 'pro',
  base_amount: 4900,
  overage_amount: 0,
  total: 4900,
  status: 'draft',
  period_start: now,
  period_end: periodEnd,
  created_at: new Date(),
}

describe('GET /orgs/:orgId/invoices', () => {
  test('1. list invoices returns 200', async () => {
    mockAuthUser()
    mockQuery
      .mockResolvedValueOnce({ rows: [{ user_id: USER_ID }] }) // membership check
      .mockResolvedValueOnce({ rows: [sampleInvoice] }) // invoices query

    const res = await request(app)
      .get(`/orgs/${ORG_ID}/invoices`)
      .set('Authorization', AUTH_HEADER)

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.invoices)).toBe(true)
  })
})

describe('GET /orgs/:orgId/invoices/:invoiceId', () => {
  test('2. returns single invoice', async () => {
    mockAuthUser()
    mockQuery
      .mockResolvedValueOnce({ rows: [{ user_id: USER_ID }] }) // membership check
      .mockResolvedValueOnce({ rows: [sampleInvoice] }) // invoice query

    const res = await request(app)
      .get(`/orgs/${ORG_ID}/invoices/${INVOICE_ID}`)
      .set('Authorization', AUTH_HEADER)

    expect(res.status).toBe(200)
    expect(res.body.invoice.id).toBe(INVOICE_ID)
  })

  test('7. invoice from different org returns 404', async () => {
    mockAuthUser()
    mockQuery
      .mockResolvedValueOnce({ rows: [{ user_id: USER_ID }] }) // membership check (user is member of ORG_ID)
      .mockResolvedValueOnce({ rows: [] }) // no invoice found for this org+id combo

    const res = await request(app)
      .get(`/orgs/${ORG_ID}/invoices/invoice-from-other-org`)
      .set('Authorization', AUTH_HEADER)

    expect(res.status).toBe(404)
  })
})

describe('POST /orgs/:orgId/invoices/generate', () => {
  test('3. generate invoice returns 201', async () => {
    mockAuthUser()
    mockQuery
      .mockResolvedValueOnce({ rows: [{ user_id: USER_ID }] }) // membership check
      .mockResolvedValueOnce({
        rows: [{ org_id: ORG_ID, plan_id: 'pro', status: 'active', current_period_start: now, current_period_end: periodEnd }],
      }) // subscription
      .mockResolvedValueOnce({ rows: [{ total: '500' }] }) // usage
      .mockResolvedValueOnce({ rows: [sampleInvoice] }) // insert

    const res = await request(app)
      .post(`/orgs/${ORG_ID}/invoices/generate`)
      .set('Authorization', AUTH_HEADER)

    expect(res.status).toBe(201)
    expect(res.body.invoice).toBeDefined()
  })

  test('4. generated invoice has baseAmount = plan.priceUsd * 100', () => {
    const result = calculateInvoiceTotal(PLANS.pro, 0)
    expect(result.baseAmount).toBe(PLANS.pro.priceUsd * 100)
  })

  test('5. generated invoice has overageAmount > 0 when usage exceeds limit', () => {
    const result = calculateInvoiceTotal(PLANS.pro, 60000)
    expect(result.overageAmount).toBeGreaterThan(0)
  })

  test('6. invoice total = baseAmount + overageAmount', () => {
    const result = calculateInvoiceTotal(PLANS.pro, 60000)
    expect(result.total).toBe(result.baseAmount + result.overageAmount)
  })
})
