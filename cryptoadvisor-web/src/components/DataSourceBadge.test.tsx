import { describe, expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import DataSourceBadge from './DataSourceBadge'

describe('DataSourceBadge', () => {
  test('renders the current data source label', () => {
    render(<DataSourceBadge />)
    const badge = screen.getByTestId('data-source-badge')
    // setupTests.ts does not set VITE_LIVE_PRICES, so we expect "mock"
    expect(badge.textContent?.toLowerCase()).toMatch(/^mock$/)
  })

  test('has accessible title attribute', () => {
    render(<DataSourceBadge />)
    const badge = screen.getByTestId('data-source-badge')
    expect(badge).toHaveAttribute('title')
  })
})
