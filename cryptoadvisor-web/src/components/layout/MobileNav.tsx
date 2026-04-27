import { NavLink } from 'react-router'
import { useTranslation } from 'react-i18next'

interface TabItem {
  path: string
  icon: string
  labelKey: string
}

const TABS: TabItem[] = [
  { path: '/',          icon: '▦', labelKey: 'nav.dashboard' },
  { path: '/portfolio', icon: '◈', labelKey: 'nav.portfolio' },
  { path: '/charts',    icon: '📈', labelKey: 'nav.charts' },
  { path: '/signals',   icon: '⚡', labelKey: 'nav.signals' },
  { path: '/alerts',    icon: '🔔', labelKey: 'nav.alerts' },
]

export default function MobileNav() {
  const { t } = useTranslation()

  return (
    <nav
      className="md:hidden flex-shrink-0 flex items-center justify-around
                 bg-bg-surface border-t border-bg-border h-16 px-2"
      aria-label="Mobile navigation"
    >
      {TABS.map(({ path, icon, labelKey }) => (
        <NavLink
          key={path}
          to={path}
          end={path === '/'}
          className={({ isActive }) =>
            `flex flex-col items-center justify-center gap-0.5 min-w-[44px] min-h-[44px]
             rounded-md px-2 py-1 text-xs font-medium transition-colors
             focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent
             ${isActive ? 'text-accent' : 'text-text-secondary hover:text-text-primary'}`
          }
        >
          <span aria-hidden="true" className="text-lg leading-none">{icon}</span>
          <span>{t(labelKey)}</span>
        </NavLink>
      ))}
    </nav>
  )
}
