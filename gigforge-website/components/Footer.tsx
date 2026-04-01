'use client';

import Link from 'next/link';
import { Github, Linkedin, Twitter } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import '@/i18n';

export default function Footer() {
  const { t } = useTranslation();

  return (
    <footer className="bg-navy text-text-inverse">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
          {/* Col 1: Logo + tagline + social */}
          <div>
            <h3 className="text-xl font-bold mb-2">GigForge</h3>
            <p className="text-blue-200 text-sm mb-4">{t('footer.tagline')}</p>
            <div className="flex items-center gap-3">
              <a
                href="https://github.com/gigforge"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="GitHub"
                className="text-blue-200 hover:text-white transition-colors"
              >
                <Github size={18} aria-hidden="true" />
              </a>
              <a
                href="https://linkedin.com/company/gigforge"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="LinkedIn"
                className="text-blue-200 hover:text-white transition-colors"
              >
                <Linkedin size={18} aria-hidden="true" />
              </a>
              <a
                href="https://twitter.com/gigforge"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Twitter"
                className="text-blue-200 hover:text-white transition-colors"
              >
                <Twitter size={18} aria-hidden="true" />
              </a>
            </div>
          </div>

          {/* Col 2: Navigation */}
          <nav aria-label={t('footer.navigation')}>
            <h4 className="text-sm font-semibold uppercase tracking-wider mb-4 text-white">
              {t('footer.navigation')}
            </h4>
            <ul className="flex flex-col gap-2">
              <li>
                <Link href="/" className="text-blue-200 hover:text-white transition-colors text-sm">
                  {t('nav.home')}
                </Link>
              </li>
              <li>
                <Link href="/services" className="text-blue-200 hover:text-white transition-colors text-sm">
                  {t('nav.services')}
                </Link>
              </li>
              <li>
                <Link href="/portfolio" className="text-blue-200 hover:text-white transition-colors text-sm">
                  {t('nav.portfolio')}
                </Link>
              </li>
              <li>
                <Link href="/about" className="text-blue-200 hover:text-white transition-colors text-sm">
                  {t('nav.about')}
                </Link>
              </li>
              <li>
                <Link href="/contact" className="text-blue-200 hover:text-white transition-colors text-sm">
                  {t('nav.contact')}
                </Link>
              </li>
            </ul>
          </nav>

          {/* Col 3: Contact */}
          <div>
            <h4 className="text-sm font-semibold uppercase tracking-wider mb-4 text-white">
              Contact
            </h4>
            <p className="text-blue-200 text-sm">{t('footer.contact')}</p>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="pt-8 border-t border-white/20">
          <p className="text-blue-200 text-sm text-center">{t('footer.copyright')}</p>
        </div>
      </div>
    </footer>
  );
}
