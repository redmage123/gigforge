'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import DarkModeToggle from './DarkModeToggle';

interface MobileNavProps {
  isOpen: boolean;
  onClose: () => void;
}

const navLinks = [
  { href: '/', key: 'nav.home' as const },
  { href: '/services', key: 'nav.services' as const },
  { href: '/portfolio', key: 'nav.portfolio' as const },
  { href: '/about', key: 'nav.about' as const },
  { href: '/contact', key: 'nav.contact' as const },
];

export default function MobileNav({ isOpen, onClose }: MobileNavProps) {
  const { t } = useTranslation();
  const pathname = usePathname();
  const dialogRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(false);

  // Close on route change (not on initial mount)
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    onClose();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Escape key + focus trap
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key === 'Tab' && dialogRef.current) {
        const focusable = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown);

    // Focus the first element in the dialog
    const firstFocusable = dialogRef.current?.querySelector<HTMLElement>(
      'button, a[href]'
    );
    firstFocusable?.focus();

    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  return (
    <div
      data-testid="mobile-menu"
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Navigation menu"
      className={[
        'fixed inset-0 z-50',
        'bg-white dark:bg-navy-900',
        'flex flex-col',
        'transition-transform duration-300 ease-in-out',
        isOpen ? 'translate-x-0' : 'translate-x-full',
      ].join(' ')}
    >
      {/* Header row */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200 dark:border-navy-700">
        <span className="text-xl font-bold text-brand-navy dark:text-text-primary-dark">
          GigForge
        </span>
        <button
          onClick={onClose}
          aria-label={t('mobileNav.close')}
          className="p-2 rounded-lg text-text-secondary dark:text-text-secondary-dark hover:bg-bg-tertiary dark:hover:bg-navy-800 transition-colors"
        >
          <X size={22} aria-hidden="true" />
        </button>
      </div>

      {/* Nav links */}
      <nav className="flex flex-col gap-1 px-4 py-6 flex-1">
        {navLinks.map(({ href, key }) => {
          const isActive = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              onClick={onClose}
              className={[
                'px-4 py-3 rounded-lg text-lg font-medium transition-colors',
                isActive
                  ? 'text-brand-gold bg-bg-secondary dark:bg-navy-800'
                  : 'text-text-secondary dark:text-text-secondary-dark hover:text-text-primary dark:hover:text-text-primary-dark hover:bg-bg-secondary dark:hover:bg-navy-800',
              ].join(' ')}
            >
              {t(key)}
            </Link>
          );
        })}
      </nav>

      {/* Footer row */}
      <div className="flex items-center gap-3 px-6 py-4 border-t border-neutral-200 dark:border-navy-700">
        <DarkModeToggle />
      </div>
    </div>
  );
}
