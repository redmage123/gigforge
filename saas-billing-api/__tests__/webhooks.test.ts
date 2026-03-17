import request from 'supertest'
import app from '../src/app'

jest.mock('../src/config/database')
import { getPool } from '../src/config/database'

jest.mock('../src/config/stripe')
import { getStripeClient } from '../src/config/stripe'

const mockQuery = jest.fn()
const mockConstructEvent = jest.fn()

beforeEach(() => {
  jest.mocked(getPool).mockReturnValue({ query: mockQuery } as any)
  mockQuery.mockReset()
  jest.mocked(getStripeClient).mockReturnValue({
    webhooks: { constructEvent: mockConstructEvent },
  } as any)
  mockConstructEvent.mockReset()
})

const RAW_BODY = Buffer.from(JSON.stringify({ id: 'evt_test', type: 'checkout.session.completed' }))
const STRIPE_SIG = 'stripe_sig_test'

describe('POST /webhooks/stripe', () => {
  test('1. valid signature returns 200 and dispatches event', async () => {
    const event = {
      id: 'evt_test',
      type: 'checkout.session.completed',
      data: { object: { metadata: { org_id: 'org-1' } } },
    }
    mockConstructEvent.mockReturnValue(event)
    mockQuery.mockResolvedValue({ rows: [] }) // UPDATE subscriptions

    const res = await request(app)
      .post('/webhooks/stripe')
      .set('stripe-signature', STRIPE_SIG)
      .set('Content-Type', 'application/json')
      .send(RAW_BODY)

    expect(res.status).toBe(200)
    expect(res.body.received).toBe(true)
    expect(res.body.type).toBe('checkout.session.completed')
  })

  test('2. invalid signature (constructEvent throws) returns 400', async () => {
    mockConstructEvent.mockImplementation(() => {
      throw new Error('Signature verification failed')
    })

    const res = await request(app)
      .post('/webhooks/stripe')
      .set('stripe-signature', 'bad_sig')
      .set('Content-Type', 'application/json')
      .send(RAW_BODY)

    expect(res.status).toBe(400)
  })

  test('3. missing stripe-signature header returns 400', async () => {
    const res = await request(app)
      .post('/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .send(RAW_BODY)

    expect(res.status).toBe(400)
  })

  test('4. checkout.session.completed updates subscription status in DB', async () => {
    const ORG_ID = 'org-checkout-1'
    const event = {
      id: 'evt_checkout',
      type: 'checkout.session.completed',
      data: { object: { metadata: { org_id: ORG_ID } } },
    }
    mockConstructEvent.mockReturnValue(event)
    mockQuery.mockResolvedValue({ rows: [] })

    await request(app)
      .post('/webhooks/stripe')
      .set('stripe-signature', STRIPE_SIG)
      .set('Content-Type', 'application/json')
      .send(RAW_BODY)

    const updateCall = mockQuery.mock.calls.find((call: unknown[]) =>
      typeof call[0] === 'string' && call[0].includes('UPDATE subscriptions') && call[0].includes("status = 'active'")
    )
    expect(updateCall).toBeDefined()
    expect(updateCall![1]).toContain(ORG_ID)
  })

  test('5. invoice.payment_succeeded marks invoice paid in DB', async () => {
    const INVOICE_ID = 'inv-paid-1'
    const event = {
      id: 'evt_invoice',
      type: 'invoice.payment_succeeded',
      data: { object: { metadata: { invoice_id: INVOICE_ID } } },
    }
    mockConstructEvent.mockReturnValue(event)
    mockQuery.mockResolvedValue({ rows: [] })

    await request(app)
      .post('/webhooks/stripe')
      .set('stripe-signature', STRIPE_SIG)
      .set('Content-Type', 'application/json')
      .send(RAW_BODY)

    const updateCall = mockQuery.mock.calls.find((call: unknown[]) =>
      typeof call[0] === 'string' && call[0].includes('UPDATE invoices') && call[0].includes("status = 'paid'")
    )
    expect(updateCall).toBeDefined()
    expect(updateCall![1]).toContain(INVOICE_ID)
  })

  test('6. customer.subscription.deleted cancels subscription in DB', async () => {
    const ORG_ID = 'org-cancelled-1'
    const event = {
      id: 'evt_sub_deleted',
      type: 'customer.subscription.deleted',
      data: { object: { metadata: { org_id: ORG_ID } } },
    }
    mockConstructEvent.mockReturnValue(event)
    mockQuery.mockResolvedValue({ rows: [] })

    await request(app)
      .post('/webhooks/stripe')
      .set('stripe-signature', STRIPE_SIG)
      .set('Content-Type', 'application/json')
      .send(RAW_BODY)

    const updateCall = mockQuery.mock.calls.find((call: unknown[]) =>
      typeof call[0] === 'string' && call[0].includes('UPDATE subscriptions') && call[0].includes("status = 'cancelled'")
    )
    expect(updateCall).toBeDefined()
    expect(updateCall![1]).toContain(ORG_ID)
  })
})
