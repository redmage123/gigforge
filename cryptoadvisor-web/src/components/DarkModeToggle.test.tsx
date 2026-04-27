import '../i18n/index.ts'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import DarkModeToggle from './DarkModeToggle'

describe('DarkModeToggle', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.classList.add('dark')
  })

  afterEach(() => {
    document.documentElement.classList.add('dark') // restore for subsequent tests
  })

  it('renders without crashing', () => {
    render(<DarkModeToggle />)
  })

  it('renders a button with accessible label', () => {
    render(<DarkModeToggle />)
    expect(screen.getByRole('button', { name: /toggle dark mode/i })).toBeInTheDocument()
  })

  it('has aria-pressed true when dark mode is on', () => {
    render(<DarkModeToggle />)
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true')
  })

  it('toggles dark class off and persists to localStorage when clicked', () => {
    render(<DarkModeToggle />)
    fireEvent.click(screen.getByRole('button'))
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(localStorage.getItem('theme')).toBe('light')
  })

  it('toggles dark class back on and updates localStorage when clicked twice', () => {
    render(<DarkModeToggle />)
    const btn = screen.getByRole('button')
    fireEvent.click(btn) // → light
    fireEvent.click(btn) // → dark again
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(localStorage.getItem('theme')).toBe('dark')
  })
})
