import { render, screen, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import userEvent from '@testing-library/user-event'
import Contact from '@/app/contact/page'

describe('Contact Page', () => {
  it('renders page title', () => {
    render(<Contact />)
    expect(screen.getByRole('heading', { name: /contact/i, level: 1 })).toBeInTheDocument()
  })

  it('renders all form fields', () => {
    render(<Contact />)
    expect(screen.getByLabelText(/name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/message/i)).toBeInTheDocument()
  })

  it('has submit button', () => {
    render(<Contact />)
    expect(screen.getByRole('button', { name: /send message/i })).toBeInTheDocument()
  })

  it('shows validation error for short name', async () => {
    const user = userEvent.setup()
    render(<Contact />)

    const nameInput = screen.getByLabelText(/name/i)
    await user.type(nameInput, 'A')
    await user.tab()

    expect(await screen.findByText(/name must be at least 2 characters/i)).toBeInTheDocument()
  })

  it('shows validation error for invalid email', async () => {
    const user = userEvent.setup()
    render(<Contact />)

    const emailInput = screen.getByLabelText(/email/i)
    await user.type(emailInput, 'invalid')
    await user.tab()

    expect(await screen.findByText(/please enter a valid email/i)).toBeInTheDocument()
  })

  it('disables submit button while loading', async () => {
    render(<Contact />)
    // Button starts enabled
    const button = screen.getByRole('button', { name: /send message/i })
    expect(button).not.toBeDisabled()
  })

  it('prevents duplicate submission on rapid double-click (BUG-56)', async () => {
    const user = userEvent.setup()

    let resolveFirst: (value: unknown) => void
    const firstCallPromise = new Promise((resolve) => { resolveFirst = resolve })

    const mockFetch = vi.fn().mockImplementation(() => firstCallPromise)
    vi.stubGlobal('fetch', mockFetch)

    render(<Contact />)
    await user.type(screen.getByLabelText(/name/i), 'Jane Doe')
    await user.type(screen.getByLabelText(/email/i), 'jane@example.com')
    await user.type(screen.getByLabelText(/message/i), 'I need help with a project please')

    const submitBtn = screen.getByRole('button', { name: /send message/i })

    // Click three times in rapid succession before the request resolves
    await user.click(submitBtn)
    await user.click(submitBtn)
    await user.click(submitBtn)

    // Resolve the first (and only) fetch call
    resolveFirst!({
      ok: true,
      json: async () => ({ success: true, message: 'Thank you for your interest!' }),
    })

    await screen.findByText(/thank you for your interest/i)

    // fetch should have been called exactly once despite multiple clicks
    expect(mockFetch).toHaveBeenCalledTimes(1)

    vi.restoreAllMocks()
  })

  it('re-enables submission after a server error (BUG-56)', async () => {
    const user = userEvent.setup()

    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ success: false, message: 'Server error, please retry' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, message: 'Thank you for your interest!' }),
      })
    vi.stubGlobal('fetch', mockFetch)

    render(<Contact />)
    await user.type(screen.getByLabelText(/name/i), 'Jane Doe')
    await user.type(screen.getByLabelText(/email/i), 'jane@example.com')
    await user.type(screen.getByLabelText(/message/i), 'I need help with a project please')

    await user.click(screen.getByRole('button', { name: /send message/i }))
    await screen.findByText(/server error/i)

    // Should be re-enabled for retry
    const btn = screen.getByRole('button', { name: /send message/i })
    expect(btn).not.toBeDisabled()

    await user.click(btn)
    await screen.findByText(/thank you for your interest/i)

    expect(mockFetch).toHaveBeenCalledTimes(2)

    vi.restoreAllMocks()
  })
})
