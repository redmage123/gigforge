import DarkModeToggle from '../DarkModeToggle'

interface HeaderProps {
  title: string
  onMenuClick: () => void
}

export default function Header({ title, onMenuClick }: HeaderProps) {
  return (
    <header className="h-16 flex items-center justify-between px-4 lg:px-6 bg-bg-surface border-b border-bg-border flex-shrink-0">
      <div className="flex items-center gap-3">
        {/* Hamburger - visible on mobile */}
        <button
          onClick={onMenuClick}
          className="lg:hidden p-2 rounded-md text-text-secondary hover:bg-bg-elevated hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-accent min-w-[44px] min-h-[44px] flex items-center justify-center"
          aria-label="Open navigation menu"
        >
          <span aria-hidden="true" className="text-xl">☰</span>
        </button>
        <h1 className="text-base font-semibold text-text-primary">{title}</h1>
      </div>

      <div className="flex items-center gap-3">
        {/* Search */}
        <div className="hidden sm:flex items-center">
          <input
            type="search"
            placeholder="Search assets…"
            className="bg-bg-elevated border border-bg-border rounded-md px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent w-48"
            aria-label="Search assets"
          />
        </div>

        {/* Dark mode toggle */}
        <DarkModeToggle />

        {/* User avatar */}
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
            aria-hidden="true"
          >
            DU
          </div>
          <span className="hidden md:inline text-sm text-text-secondary">Demo User</span>
        </div>
      </div>
    </header>
  )
}
