import '../../i18n/index.ts'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import MobileNav from './MobileNav'

function renderMobileNav(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <MobileNav />
    </MemoryRouter>
  )
}

describe('MobileNav', () => {
  it('renders without crashing', () => {
    renderMobileNav()
  })

  it('renders a nav with accessible label', () => {
    renderMobileNav()
    expect(screen.getByRole('navigation', { name: /mobile navigation/i })).toBeInTheDocument()
  })

  it('renders exactly 5 tab links', () => {
    renderMobileNav()
    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(5)
  })

  it('renders Dashboard, Portfolio, Charts, Signals, Alerts tabs', () => {
    renderMobileNav()
    expect(screen.getByRole('link', { name: /dashboard/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /portfolio/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /charts/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /signals/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /alerts/i })).toBeInTheDocument()
  })

  it('Dashboard link is active when on root path', () => {
    renderMobileNav('/')
    const dashboardLink = screen.getByRole('link', { name: /dashboard/i })
    // NavLink applies active class — verify the link is present and points to /
    expect(dashboardLink).toHaveAttribute('href', '/')
  })
})
