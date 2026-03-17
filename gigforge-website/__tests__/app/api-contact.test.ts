import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockSend = vi.fn().mockResolvedValue({ id: 'mock-email-id', error: null })

vi.mock('resend', () => {
  return {
    Resend: vi.fn().mockImplementation(() => ({
      emails: { send: mockSend },
    })),
  }
})

// Import AFTER mocks are set up
const { POST } = await import('@/app/api/contact/route')

describe('POST /api/contact', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
    vi.clearAllMocks()
    mockSend.mockResolvedValue({ id: 'mock-email-id', error: null })
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('returns success for valid request', async () => {
    const request = new Request('http://localhost:3000/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'John Doe',
        email: 'john@example.com',
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
        message: 'This is a test message.',
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
        message: 'This is a test message.',
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

  // Resend integration tests
  it('sends email via Resend when RESEND_API_KEY is configured', async () => {
    process.env.RESEND_API_KEY = 'test-api-key'
    process.env.CONTACT_EMAIL = 'hello@gigforge.ai'

    const request = new Request('http://localhost:3000/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Jane Smith',
        email: 'jane@example.com',
        message: 'Hello, I need help with my project.',
      }),
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.success).toBe(true)
    expect(mockSend).toHaveBeenCalledOnce()
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ['hello@gigforge.ai'],
        subject: expect.stringContaining('Jane Smith'),
      })
    )
  })

  it('falls back gracefully when RESEND_API_KEY is not set', async () => {
    delete process.env.RESEND_API_KEY
    delete process.env.CONTACT_EMAIL

    const request = new Request('http://localhost:3000/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Jane Smith',
        email: 'jane@example.com',
        message: 'Hello, I need help with my project.',
      }),
    })

    const response = await POST(request)
    const data = await response.json()

    // Should still succeed even without email configured
    expect(response.status).toBe(200)
    expect(data.success).toBe(true)
    // Resend should NOT be called when no API key
    expect(mockSend).not.toHaveBeenCalled()
  })
})
