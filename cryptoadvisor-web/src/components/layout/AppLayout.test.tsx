import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router'
import AppLayout from './AppLayout'

function renderLayout() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<div>Page content</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  )
}

describe('AppLayout', () => {
  it('renders without crashing', () => {
    renderLayout()
  })

  it('renders child route content', () => {
    renderLayout()
    expect(screen.getByText('Page content')).toBeInTheDocument()
  })

  it('renders the navigation', () => {
    renderLayout()
    expect(screen.getByRole('navigation', { name: /Main navigation/i })).toBeInTheDocument()
  })

  it('renders main content area', () => {
    renderLayout()
    expect(screen.getByRole('main')).toBeInTheDocument()
  })

  it('opens mobile sidebar when menu button is clicked', () => {
    renderLayout()
    const menuBtn = screen.getByRole('button', { name: /open navigation menu/i })
    const navsBefore = screen.getAllByRole('navigation').length
    fireEvent.click(menuBtn)
    expect(screen.getAllByRole('navigation').length).toBe(navsBefore + 1)
  })

  it('closes mobile sidebar when a nav link is clicked', () => {
    renderLayout()
    const menuBtn = screen.getByRole('button', { name: /open navigation menu/i })
    fireEvent.click(menuBtn)
    const navsOpen = screen.getAllByRole('navigation').length
    expect(navsOpen).toBeGreaterThan(1)
    // Find Dashboard link inside the mobile sidebar overlay (the second "Main navigation")
    const mainNavs = screen.getAllByRole('navigation', { name: /Main navigation/i })
    const mobileSidebarNav = mainNavs[mainNavs.length - 1]!
    const dashboardLink = within(mobileSidebarNav).getByRole('link', { name: /Dashboard/i })
    fireEvent.click(dashboardLink)
    expect(screen.getAllByRole('navigation').length).toBeLessThan(navsOpen)
  })
})
