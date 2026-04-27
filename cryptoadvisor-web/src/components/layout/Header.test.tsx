import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import Header from './Header'

const PAGE_TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/portfolio': 'Portfolio',
}

function renderHeader(path = '/') {
  const title = PAGE_TITLES[path] ?? 'CryptoAdvisor'
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Header title={title} onMenuClick={vi.fn()} />
    </MemoryRouter>
  )
}

describe('Header', () => {
  it('renders without crashing', () => {
    renderHeader()
  })

  it('renders Dashboard title on root path', () => {
    renderHeader('/')
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
  })

  it('renders Portfolio title on /portfolio', () => {
    renderHeader('/portfolio')
    expect(screen.getByText('Portfolio')).toBeInTheDocument()
  })

  it('renders the menu button', () => {
    renderHeader()
    expect(screen.getByRole('button', { name: /open navigation menu/i })).toBeInTheDocument()
  })

  it('renders search input', () => {
    renderHeader()
    expect(screen.getByRole('searchbox')).toBeInTheDocument()
  })

  it('calls onMenuClick when menu button is clicked', async () => {
    const onMenuClick = vi.fn()
    render(
      <MemoryRouter initialEntries={['/']}>
        <Header title="Dashboard" onMenuClick={onMenuClick} />
      </MemoryRouter>
    )
    screen.getByRole('button', { name: /open navigation menu/i }).click()
    expect(onMenuClick).toHaveBeenCalledTimes(1)
  })
})
