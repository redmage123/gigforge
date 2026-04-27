import '../i18n/index.ts'
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import LanguageSwitcher from './LanguageSwitcher'

describe('LanguageSwitcher', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('renders without crashing', () => {
    render(<LanguageSwitcher />)
  })

  it('renders a group with accessible label', () => {
    render(<LanguageSwitcher />)
    expect(screen.getByRole('group', { name: /language selector/i })).toBeInTheDocument()
  })

  it('renders EN and HR buttons', () => {
    render(<LanguageSwitcher />)
    expect(screen.getByRole('button', { name: 'EN' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'HR' })).toBeInTheDocument()
  })

  it('EN button has aria-pressed=true by default', () => {
    render(<LanguageSwitcher />)
    expect(screen.getByRole('button', { name: 'EN' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('switches language to HR and persists to localStorage', () => {
    render(<LanguageSwitcher />)
    fireEvent.click(screen.getByRole('button', { name: 'HR' }))
    expect(localStorage.getItem('lang')).toBe('hr')
  })

  it('switches back to EN and updates localStorage', () => {
    render(<LanguageSwitcher />)
    fireEvent.click(screen.getByRole('button', { name: 'HR' }))
    fireEvent.click(screen.getByRole('button', { name: 'EN' }))
    expect(localStorage.getItem('lang')).toBe('en')
  })
})
