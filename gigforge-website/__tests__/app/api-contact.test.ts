import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock fetch used by the route to call the webhook and Mailgun
const mockFetch = vi.fn().mockResolvedValue(new Response('', { status: 200 }))
vi.stubGlobal('fetch', mockFetch)

// Import AFTER stubs are set up
const routeModule = await import('@/app/api/contact/route')
let POST = routeModule.POST

describe('POST /api/contact', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockResolvedValue(new Response('', { status: 200 }))
    // Re-import to get a fresh module with a clean submissionCache for each test
    // (cache is module-level, so we reset by reimporting via cache-busting isn't practical;
    //  instead we use unique email addresses per idempotency test)
  })

  it('returns 200 success for valid request', async () => {
    const request = new Request('http://localhost:3000/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'John Doe',
        email: 'john.success.test@example.com',
        message: 'This is a test message with sufficient length.',
      }),
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.message).toBeTruthy()
  })

  it('returns 422 for invalid email', async () => {
    const request = new Request('http://localhost:3000/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'John Doe',
        email: 'invalid-email',
        message: 'This is a test message with sufficient length.',
      }),
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(422)
    expect(data.success).toBe(false)
    expect(data.errors?.email).toBeTruthy()
  })

  it('returns 422 for short name', async () => {
    const request = new Request('http://localhost:3000/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'A',
        email: 'john@example.com',
        message: 'This is a test message with sufficient length.',
      }),
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(422)
    expect(data.success).toBe(false)
    expect(data.errors?.name).toBeTruthy()
  })

  it('returns 422 for short message', async () => {
    const request = new Request('http://localhost:3000/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'John Doe',
        email: 'john@example.com',
        message: 'Short',
      }),
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(422)
    expect(data.success).toBe(false)
    expect(data.errors?.message).toBeTruthy()
  })

  it('returns 400 for invalid JSON', async () => {
    const request = new Request('http://localhost:3000/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'invalid json',
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.success).toBe(false)
  })

  it('fires webhook on first submission', async () => {
    const request = new Request('http://localhost:3000/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Alice',
        email: 'alice.webhook.test@example.com',
        message: 'I need help with my website project please.',
      }),
    })

    await POST(request)

    // At least one webhook call fired
    expect(mockFetch).toHaveBeenCalled()
  })

  it('deduplicates: second identical submission does NOT fire webhook again', async () => {
    const payload = JSON.stringify({
      name: 'Bob Duplicate',
      email: 'bob.dedup.unique1@example.com',
      message: 'Please do not send this message twice to the webhook.',
    })

    const makeRequest = () =>
      new Request('http://localhost:3000/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      })

    // First submission
    const res1 = await POST(makeRequest())
    const data1 = await res1.json()
    expect(res1.status).toBe(200)
    expect(data1.success).toBe(true)
    const firstCallCount = mockFetch.mock.calls.length

    // Second identical submission (duplicate)
    const res2 = await POST(makeRequest())
    const data2 = await res2.json()
    expect(res2.status).toBe(200)
    expect(data2.success).toBe(true)

    // No additional fetch calls — duplicate was short-circuited
    expect(mockFetch.mock.calls.length).toBe(firstCallCount)
  })

  it('allows different email to submit independently', async () => {
    const makeRequest = (email: string) =>
      new Request('http://localhost:3000/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Carol',
          email,
          message: 'Same message text but different email address.',
        }),
      })

    mockFetch.mockClear()
    await POST(makeRequest('carol.a.uniquetest@example.com'))
    const afterFirst = mockFetch.mock.calls.length

    await POST(makeRequest('carol.b.uniquetest@example.com'))
    // Second should also fire (different email = different key)
    expect(mockFetch.mock.calls.length).toBeGreaterThan(afterFirst)
  })
})
