import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
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
})
