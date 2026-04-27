import { useState } from 'react'
import { useTranslation } from 'react-i18next'

// Note: main.tsx always initialises to dark. A light-mode CSS layer must be
// added to index.css before the toggle produces a visible light-mode effect.
export default function DarkModeToggle() {
  const { t } = useTranslation()
  const [isDark, setIsDark] = useState<boolean>(
    () => document.documentElement.classList.contains('dark')
  )

  function toggle() {
    const next = !isDark
    setIsDark(next)
    if (next) {
      document.documentElement.classList.add('dark')
      localStorage.setItem('theme', 'dark')
    } else {
      document.documentElement.classList.remove('dark')
      localStorage.setItem('theme', 'light')
    }
  }

  return (
    <button
      onClick={toggle}
      aria-label={t('darkMode.toggle')}
      aria-pressed={isDark}
      className="p-2 rounded-md text-text-secondary hover:bg-bg-elevated hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent min-w-[44px] min-h-[44px] flex items-center justify-center transition-colors"
    >
      <span aria-hidden="true" className="text-base">
        {isDark ? '\u2600' : '\u263E'}
      </span>
    </button>
  )
}
