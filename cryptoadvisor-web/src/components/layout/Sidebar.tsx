import { NavLink } from 'react-router'
import LanguageSwitcher from '../LanguageSwitcher'

interface NavItem {
  path: string
  label: string
  icon: string
}

const NAV_ITEMS: NavItem[] = [
  { path: '/', label: 'Dashboard', icon: '▦' },
  { path: '/portfolio', label: 'Portfolio', icon: '◈' },
  { path: '/charts', label: 'Charts', icon: '📈' },
  { path: '/signals', label: 'Signals', icon: '⚡' },
  { path: '/alerts', label: 'Alerts', icon: '🔔' },
  { path: '/transactions', label: 'Transactions', icon: '↕' },
  { path: '/watchlist', label: 'Watchlist', icon: '★' },
  { path: '/risk', label: 'Risk Calc', icon: '⚖' },
]

interface SidebarProps {
  onClose?: () => void
}

export default function Sidebar({ onClose }: SidebarProps) {
  return (
    <nav className="flex flex-col h-full bg-bg-surface border-r border-bg-border" aria-label="Main navigation">
      {/* Logo */}
      <div className="h-16 flex items-center px-4 border-b border-bg-border flex-shrink-0">
        <span className="text-accent font-bold text-lg tracking-tight">CryptoAdvisor</span>
      </div>

      {/* Nav links */}
      <div className="flex-1 py-4 overflow-y-auto">
        <ul className="space-y-1 px-2">
          {NAV_ITEMS.map(({ path, label, icon }) => (
            <li key={path}>
              <NavLink
                to={path}
                end={path === '/'}
                onClick={onClose}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-accent min-h-[44px] ${
                    isActive
                      ? 'bg-bg-elevated text-text-primary border-l-2 border-accent pl-[calc(0.75rem-2px)]'
                      : 'text-text-secondary hover:bg-bg-elevated hover:text-text-primary'
                  }`
                }
              >
                <span aria-hidden="true" className="text-base w-5 text-center">
                  {icon}
                </span>
                <span>{label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </div>

      {/* Language switcher — pinned to sidebar bottom */}
      <div className="flex-shrink-0 border-t border-bg-border py-3">
        <LanguageSwitcher />
      </div>
    </nav>
  )
}
