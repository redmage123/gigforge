import { useState, useEffect, useCallback } from 'react'
import { NavLink } from 'react-router-dom'
import { api } from '../api/client'

const PIN = '\uD83D\uDCCC'
const EYE = '\uD83D\uDC41'
const EYE_SPEECH = '\uD83D\uDC41\uFE0F\u200D\uD83D\uDDE8\uFE0F'

const navSections = [
  {
    label: 'Markets',
    items: [
      { path: '/', label: 'Dashboard', icon: '\uD83D\uDCCA' },
      { path: '/technical', label: 'Technical', icon: '\uD83D\uDCC8' },
      { path: '/sentiment', label: 'Sentiment', icon: '\uD83D\uDCAC' },
      { path: '/correlation', label: 'Correlation', icon: '\uD83D\uDD17' },
      { path: '/orderbook', label: 'Order Book', icon: '\uD83D\uDCD6' },
      { path: '/liquidations', label: 'Liquidations', icon: '\uD83D\uDCA5' },
    ],
  },
  {
    label: 'Portfolio',
    items: [
      { path: '/portfolio', label: 'Portfolio', icon: '\uD83D\uDCBC' },
      { path: '/wallet', label: 'Wallet', icon: '\uD83D\uDCB0' },
      { path: '/trades', label: 'Trades', icon: '\u21C4' },
      { path: '/onchain-pnl', label: 'On-chain P&L', icon: '\uD83D\uDCB9' },
      { path: '/backtest', label: 'Backtest', icon: '\uD83E\uDDEA' },
      { path: '/share-portfolio', label: 'Share', icon: '\uD83D\uDD17' },
    ],
  },
  {
    label: 'DeFi & NFTs',
    items: [
      { path: '/defi', label: 'DeFi', icon: '\uD83C\uDFE6' },
      { path: '/staking', label: 'Staking', icon: '\uD83D\uDCE6' },
      { path: '/nfts', label: 'NFTs', icon: '\uD83D\uDDBC' },
      { path: '/yields', label: 'Yields', icon: '\uD83C\uDF31' },
      { path: '/impermanent-loss', label: 'Impermanent Loss', icon: '\uD83D\uDCC9' },
      { path: '/governance', label: 'Governance', icon: '\uD83C\uDFDB' },
    ],
  },
  {
    label: 'Tools',
    items: [
      { path: '/alerts', label: 'Alerts', icon: '\uD83D\uDD14' },
      { path: '/dca', label: 'DCA Calculator', icon: '\uD83D\uDCF1' },
      { path: '/dca-plans', label: 'DCA Plans', icon: '\uD83D\uDCC5' },
      { path: '/gas', label: 'Gas Tracker', icon: '\u26FD' },
      { path: '/tax', label: 'Tax Report', icon: '\uD83D\uDCDD' },
      { path: '/whales', label: 'Whale Tracker', icon: '\uD83D\uDC0B' },
      { path: '/copy-trading', label: 'Copy Trading', icon: '\uD83D\uDC65' },
      { path: '/token-approvals', label: 'Token Approvals', icon: '\u2714' },
      { path: '/airdrops', label: 'Airdrops', icon: '\uD83C\uDF81' },
      { path: '/mempool', label: 'Mempool', icon: '\uD83D\uDCE1' },
      { path: '/token-unlocks', label: 'Token Unlocks', icon: '\uD83D\uDD13' },
      { path: '/converter', label: 'Converter', icon: '\uD83D\uDCB1' },
    ],
  },
  {
    label: 'Security',
    items: [
      { path: '/wallet-health', label: 'Wallet Health', icon: '\uD83D\uDEE1' },
      { path: '/rugpull', label: 'Rug Detector', icon: '\u26A0' },
      { path: '/multisig', label: 'Multi-sig', icon: '\uD83D\uDD11' },
    ],
  },
  {
    label: 'AI Assistant',
    items: [
      { path: '/ai-briefing', label: 'Market Briefing', icon: '\uD83E\uDDE0' },
      { path: '/ai-risk', label: 'Risk Report', icon: '\uD83D\uDCCA' },
      { path: '/ai-tax', label: 'Tax Optimizer', icon: '\uD83D\uDCB8' },
      { path: '/ai-portfolio', label: 'Portfolio Builder', icon: '\uD83C\uDFAF' },
      { path: '/pattern-recognition', label: 'Pattern Recognition', icon: '\uD83D\uDD0D' },
      { path: '/regulatory', label: 'Regulatory Monitor', icon: '\uD83D\uDCDC' },
      { path: '/trading-coach', label: 'Trading Coach', icon: '\uD83C\uDF93' },
      { path: '/memory', label: 'AI Memory', icon: '\uD83E\uDDE0' },
      { path: '/search', label: 'Search', icon: '\uD83D\uDD0E' },
    ],
  },
  {
    label: 'Blockchain',
    items: [
      { path: '/blockchain', label: 'Blockchain', icon: '\uD83D\uDD17' },
      { path: '/analytics', label: 'Analytics', icon: '\uD83D\uDCCA' },
      { path: '/dev-activity', label: 'Dev Activity', icon: '\uD83D\uDC68\u200D\uD83D\uDCBB' },
    ],
  },
  {
    label: 'Exchange',
    items: [
      { path: '/exchanges', label: 'Exchanges', icon: '\uD83C\uDFE2' },
    ],
  },
  {
    label: 'Account',
    items: [
      { path: '/billing', label: 'Billing', icon: '\uD83D\uDCB3' },
    ],
  },
]

// Build a flat lookup: path -> {label, icon, section}
const allItems = {}
navSections.forEach(s => s.items.forEach(item => {
  allItems[item.path] = { ...item, section: s.label }
}))

function Sidebar() {
  const [isOpen, setIsOpen] = useState(false)
  const [prefs, setPrefs] = useState(null)
  const [editMode, setEditMode] = useState(false)

  const fetchPrefs = useCallback(async () => {
    try {
      const res = await api.get('/api/sidebar/')
      if (res && typeof res === 'object') setPrefs(res)
    } catch {
      setPrefs({ collapsed_sections: [], pinned_pages: [], hidden_sections: [] })
    }
  }, [])

  useEffect(() => { fetchPrefs() }, [fetchPrefs])

  const closeSidebar = () => setIsOpen(false)

  const toggleCollapse = async (section) => {
    // Optimistic update
    setPrefs(prev => {
      if (!prev) return prev
      const list = prev.collapsed_sections || []
      return {
        ...prev,
        collapsed_sections: list.includes(section) ? list.filter(s => s !== section) : [...list, section]
      }
    })
    try {
      const res = await api.post('/api/sidebar/collapse', { section })
      setPrefs(res)
    } catch {}
  }

  const togglePin = async (path) => {
    setPrefs(prev => {
      if (!prev) return prev
      const list = prev.pinned_pages || []
      return {
        ...prev,
        pinned_pages: list.includes(path) ? list.filter(p => p !== path) : [...list, path]
      }
    })
    try {
      const res = await api.post('/api/sidebar/pin', { path })
      setPrefs(res)
    } catch {}
  }

  const toggleVisibility = async (section) => {
    setPrefs(prev => {
      if (!prev) return prev
      const list = prev.hidden_sections || []
      return {
        ...prev,
        hidden_sections: list.includes(section) ? list.filter(s => s !== section) : [...list, section]
      }
    })
    try {
      const res = await api.post('/api/sidebar/visibility', { section })
      setPrefs(res)
    } catch {}
  }

  const collapsed = prefs?.collapsed_sections || []
  const pinned = prefs?.pinned_pages || []
  const hidden = prefs?.hidden_sections || []

  return (
    <>
      <button
        className="hamburger"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Toggle menu"
      >
        {isOpen ? '\u2715' : '\u2630'}
      </button>

      {isOpen && <div className="sidebar-overlay" onClick={closeSidebar} />}

      <nav className={`sidebar ${isOpen ? 'open' : ''}`}>
        <div className="logo">
          <h2>CryptoAdvisor</h2>
        </div>

        <button
          className="sidebar-edit-btn"
          onClick={() => setEditMode(!editMode)}
          title={editMode ? 'Done editing' : 'Customize sidebar'}
        >
          {editMode ? '\u2714 Done' : '\u270E Customize'}
        </button>

        <ul className="nav-links">
          {pinned.length > 0 && !editMode && (
            <li className="nav-section-group pinned-section">
              <span className="nav-section">
                <span className="section-icon">{PIN}</span>
                Pinned
              </span>
              <ul>
                {pinned.map((path) => {
                  const item = allItems[path]
                  if (!item) return null
                  return (
                    <li key={`pin-${path}`}>
                      <NavLink
                        to={path}
                        end={path === '/'}
                        className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                        onClick={closeSidebar}
                      >
                        <span className="nav-item-icon">{item.icon}</span>
                        {item.label}
                      </NavLink>
                    </li>
                  )
                })}
              </ul>
            </li>
          )}

          {navSections.map((section) => {
            const isHidden = hidden.includes(section.label)
            const isCollapsed = collapsed.includes(section.label)

            if (isHidden && !editMode) return null

            return (
              <li key={section.label} className={`nav-section-group ${isHidden ? 'section-hidden' : ''}`}>
                <span
                  className="nav-section"
                  onClick={() => !editMode && toggleCollapse(section.label)}
                  style={{ cursor: editMode ? 'default' : 'pointer' }}
                >
                  <span className={`section-chevron ${isCollapsed && !editMode ? 'collapsed' : ''}`}>
                    {'\u25BE'}
                  </span>
                  {section.label}
                  {editMode && (
                    <span className="section-edit-controls">
                      <button
                        className="section-vis-btn"
                        onClick={(e) => { e.stopPropagation(); toggleVisibility(section.label) }}
                        title={isHidden ? 'Show section' : 'Hide section'}
                      >
                        {isHidden ? EYE : EYE_SPEECH}
                      </button>
                    </span>
                  )}
                </span>
                {!isCollapsed && (
                  <ul>
                    {section.items.map((item) => (
                      <li key={item.path}>
                        {editMode ? (
                          <div className="nav-item-edit">
                            <span className="nav-item-icon">{item.icon}</span>
                            <span>{item.label}</span>
                            <button
                              className={`pin-btn ${pinned.includes(item.path) ? 'pinned' : ''}`}
                              onClick={() => togglePin(item.path)}
                              title={pinned.includes(item.path) ? 'Unpin' : 'Pin to top'}
                            >
                              {PIN}
                            </button>
                          </div>
                        ) : (
                          <NavLink
                            to={item.path}
                            end={item.path === '/'}
                            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                            onClick={closeSidebar}
                          >
                            <span className="nav-item-icon">{item.icon}</span>
                            {item.label}
                          </NavLink>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
        <div className="sidebar-footer">
          <span className="sidebar-brand">CryptoAdvisor v1.0</span>
        </div>
      </nav>
    </>
  )
}

export default Sidebar
