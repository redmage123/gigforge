import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect } from 'vitest'
import Header from '@/components/Header'

describe('Header', () => {
  it('renders the GigForge logo image', () => {
    render(<Header />)
    // Logo replaces the plain-text brand name — must be an img with alt containing "GigForge"
    const logoImgs = screen.getAllByRole('img', { name: /gigforge/i })
    expect(logoImgs.length).toBeGreaterThanOrEqual(1)
  })

  it('logo links to the home page', () => {
    render(<Header />)
    // The logo is wrapped in a Link to "/"
    const logoLink = screen.getByRole('link', { name: /gigforge/i })
    expect(logoLink).toHaveAttribute('href', '/')
  })

  it('renders all navigation links', () => {
    render(<Header />)
    expect(screen.getByRole('link', { name: /home/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /portfolio/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /services/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /about/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /contact/i })).toBeInTheDocument()
  })

  it('renders Get Started CTA button', () => {
    render(<Header />)
    expect(screen.getByRole('link', { name: /get started/i })).toBeInTheDocument()
  })

  it('has accessible navigation landmark', () => {
    render(<Header />)
    expect(screen.getByRole('navigation')).toBeInTheDocument()
  })

  // Mobile hamburger menu tests
  it('renders hamburger menu button', () => {
    render(<Header />)
    expect(screen.getByRole('button', { name: /toggle menu/i })).toBeInTheDocument()
  })

  it('mobile menu is closed by default', () => {
    render(<Header />)
    expect(screen.queryByTestId('mobile-menu')).not.toBeInTheDocument()
  })

  it('clicking hamburger opens mobile menu', async () => {
    const user = userEvent.setup()
    render(<Header />)
    const hamburger = screen.getByRole('button', { name: /toggle menu/i })
    await user.click(hamburger)
    expect(screen.getByTestId('mobile-menu')).toBeInTheDocument()
  })

  it('mobile menu shows all navigation links when open', async () => {
    const user = userEvent.setup()
    render(<Header />)
    await user.click(screen.getByRole('button', { name: /toggle menu/i }))
    const mobileMenu = screen.getByTestId('mobile-menu')
    expect(mobileMenu).toHaveTextContent('Home')
    expect(mobileMenu).toHaveTextContent('Portfolio')
    expect(mobileMenu).toHaveTextContent('Services')
    expect(mobileMenu).toHaveTextContent('About')
    expect(mobileMenu).toHaveTextContent('Contact')
  })

  it('clicking a nav link in mobile menu closes the menu', async () => {
    const user = userEvent.setup()
    render(<Header />)
    await user.click(screen.getByRole('button', { name: /toggle menu/i }))
    expect(screen.getByTestId('mobile-menu')).toBeInTheDocument()
    const homeLinks = screen.getAllByRole('link', { name: /^home$/i })
    // Click the one inside the mobile menu
    await user.click(homeLinks[homeLinks.length - 1])
    expect(screen.queryByTestId('mobile-menu')).not.toBeInTheDocument()
  })

  it('clicking hamburger again closes the open menu', async () => {
    const user = userEvent.setup()
    render(<Header />)
    const hamburger = screen.getByRole('button', { name: /toggle menu/i })
    await user.click(hamburger)
    expect(screen.getByTestId('mobile-menu')).toBeInTheDocument()
    await user.click(hamburger)
    expect(screen.queryByTestId('mobile-menu')).not.toBeInTheDocument()
  })
})
