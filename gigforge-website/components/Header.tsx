'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { Menu } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import '@/i18n';
import MobileNav from './MobileNav';

const navLinks = [
  { href: '/', labelKey: 'nav.home' as const },
  { href: '/services', labelKey: 'nav.services' as const },
  { href: '/portfolio', labelKey: 'nav.portfolio' as const },
  { href: '/about', labelKey: 'nav.about' as const },
  { href: '/blog', labelKey: 'nav.blog' as const },
  { href: '/contact', labelKey: 'nav.contact' as const },
];

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { t } = useTranslation();
  const pathname = usePathname();

  return (
    <>
      <header className="sticky top-0 z-40 bg-white border-b border-neutral-200">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center">
            <Image
              src="/images/logo.svg"
              alt={t('header.logoAlt')}
              width={140}
              height={32}
              priority
              unoptimized
              className="hidden md:block"
            />
            <Image
              src="/images/logo-icon.svg"
              alt={t('header.logoAlt')}
              width={32}
              height={32}
              priority
              unoptimized
              className="md:hidden"
            />
          </Link>

          {/* Desktop nav */}
          <nav className="hidden lg:flex items-center gap-6" aria-label="Main navigation">
            {navLinks.map(({ href, labelKey }) => {
              const isActive = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  className={[
                    'text-sm font-medium transition-colors',
                    isActive
                      ? 'text-gold font-semibold'
                      : 'text-text-secondary hover:text-navy',
                  ].join(' ')}
                  aria-current={isActive ? 'page' : undefined}
                >
                  {t(labelKey)}
                </Link>
              );
            })}
          </nav>

          {/* Right controls */}
          <div className="flex items-center gap-2">
            {/* Get Started CTA */}
            <Link
              href="/contact"
              className="hidden lg:inline-flex items-center px-5 py-2 rounded-lg text-sm font-semibold bg-gold text-white hover:bg-gold-hover transition-colors focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2"
            >
              {t('header.getStarted')}
            </Link>

            {/* Hamburger — mobile/tablet only */}
            <button
              aria-label="Toggle menu"
              aria-expanded={menuOpen}
              aria-controls="mobile-nav"
              onClick={() => setMenuOpen(prev => !prev)}
              className="lg:hidden p-2 rounded-lg text-text-secondary hover:bg-bg-light transition-colors focus:outline-none focus:ring-2 focus:ring-navy focus:ring-offset-2"
            >
              <Menu size={22} aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile nav overlay */}
      {menuOpen && (
        <MobileNav isOpen={menuOpen} onClose={() => setMenuOpen(false)} />
      )}
    </>
  );
}
