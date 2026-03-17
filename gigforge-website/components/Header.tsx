'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useState } from 'react'

const navLinks = [
  { href: '/', label: 'Home' },
  { href: '/portfolio', label: 'Portfolio' },
  { href: '/demos', label: 'Demos' },
  { href: '/services', label: 'Services' },
  { href: '/payments', label: 'Payments' },
  { href: '/about', label: 'About' },
  { href: '/contact', label: 'Contact' },
  { href: 'https://support.gigforge.ai', label: 'Support', external: true },
]

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <header className="border-b border-bg-secondary relative">
      <div className="max-w-[1280px] mx-auto px-6 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center">
          {/* Full logo — desktop */}
          <Image
            src="/images/logo.svg"
            alt="GigForge logo"
            width={160}
            height={36}
            priority
            unoptimized
            className="hidden md:block"
          />
          {/* Icon only — mobile */}
          <Image
            src="/images/logo-icon.svg"
            alt="GigForge"
            width={36}
            height={36}
            priority
            unoptimized
            className="md:hidden"
          />
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-8">
          {navLinks.map((link) =>
            link.external ? (
              <a
                key={link.href + link.label}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-text-secondary hover:text-accent transition-colors"
              >
                {link.label}
              </a>
            ) : (
              <Link
                key={link.href + link.label}
                href={link.href}
                className="text-text-secondary hover:text-accent transition-colors"
              >
                {link.label}
              </Link>
            )
          )}
          <Link
            href="/contact"
            className="bg-accent text-text-primary px-6 py-2 rounded-lg hover:bg-blue-600 transition-colors"
          >
            Get Started
          </Link>
        </nav>

        {/* Hamburger button — mobile only */}
        <button
          aria-label="Toggle menu"
          className="md:hidden flex flex-col gap-1.5 p-2"
          onClick={() => setMenuOpen((prev) => !prev)}
        >
          <span className="block w-6 h-0.5 bg-text-primary" />
          <span className="block w-6 h-0.5 bg-text-primary" />
          <span className="block w-6 h-0.5 bg-text-primary" />
        </button>
      </div>

      {/* Mobile nav panel */}
      {menuOpen && (
        <nav
          data-testid="mobile-menu"
          className="md:hidden absolute top-full left-0 right-0 bg-bg-primary border-b border-bg-secondary px-6 py-4 flex flex-col gap-4 z-50"
        >
          {navLinks.map((link) =>
            link.external ? (
              <a
                key={link.href + link.label}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-text-secondary hover:text-accent transition-colors"
                onClick={() => setMenuOpen(false)}
              >
                {link.label}
              </a>
            ) : (
              <Link
                key={link.href + link.label}
                href={link.href}
                className="text-text-secondary hover:text-accent transition-colors"
                onClick={() => setMenuOpen(false)}
              >
                {link.label}
              </Link>
            )
          )}
          <Link
            href="/contact"
            className="bg-accent text-text-primary px-6 py-2 rounded-lg hover:bg-blue-600 transition-colors text-center"
            onClick={() => setMenuOpen(false)}
          >
            Get Started
          </Link>
        </nav>
      )}
    </header>
  )
}
