import { useTranslation } from 'react-i18next'

type Lang = 'en' | 'hr'

export default function LanguageSwitcher() {
  const { i18n } = useTranslation()
  const current = i18n.language as Lang

  function switchTo(lang: Lang) {
    i18n.changeLanguage(lang)
    localStorage.setItem('lang', lang)
  }

  return (
    <div className="flex gap-1 px-2 py-1" role="group" aria-label="Language selector">
      {(['en', 'hr'] as Lang[]).map((lang) => (
        <button
          key={lang}
          onClick={() => switchTo(lang)}
          aria-pressed={current === lang}
          className={`px-2 py-1 rounded text-xs font-semibold uppercase transition-colors
                      min-h-[36px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent
                      ${
                        current === lang
                          ? 'bg-accent text-white'
                          : 'text-text-secondary hover:bg-bg-elevated hover:text-text-primary'
                      }`}
        >
          {lang.toUpperCase()}
        </button>
      ))}
    </div>
  )
}
