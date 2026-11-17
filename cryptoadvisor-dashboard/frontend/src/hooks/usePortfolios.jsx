import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { api, setPortfolioScope } from '../api/client'

const PortfolioContext = createContext(null)
const KEY = 'assetadvisor.portfolio'

function readSaved() {
  try { return localStorage.getItem(KEY) || 'all' } catch { return 'all' }
}

// Which portfolio the app is looking at, shared by the top-bar switcher and every page
export function PortfolioProvider({ children }) {
  const [own, setOwn] = useState([])
  const [shared, setShared] = useState([])
  const [firms, setFirms] = useState([])
  const [current, setCurrentState] = useState(() => { const v = readSaved(); setPortfolioScope(v); return v })
  const [loaded, setLoaded] = useState(false)

  const refresh = useCallback(() => api.get('/api/portfolios/').then((r) => {
    setOwn(r.own || [])
    setShared(r.shared || [])
    setFirms(r.firms || [])
    setLoaded(true)
    return r
  }).catch(() => setLoaded(true)), [])

  const setCurrent = useCallback((id) => {
    const v = id || 'all'
    setPortfolioScope(v)
    setCurrentState(v)
    try { localStorage.setItem(KEY, v) } catch { /* private mode: selection just isn't remembered */ }
    // Pages using useFetch reload with the new scope
    window.dispatchEvent(new CustomEvent('assetadvisor:data-changed', { detail: { portfolio: v } }))
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const firmPortfolios = firms.flatMap((f) => f.portfolios)
  const all = [...own, ...shared, ...firmPortfolios]
  const firmView = current.startsWith('firm:') ? firms.find((f) => f.id === current.slice(5)) : null

  // A remembered portfolio that was deleted, unshared or left falls back to the combined view
  useEffect(() => {
    if (loaded && current !== 'all' && !firmView && !all.some((p) => p.id === current)) setCurrent('all')
  }, [loaded, own, shared, firms, current, setCurrent])

  const selected = current === 'all' ? null
    : firmView ? { id: current, name: `All ${firmView.name} portfolios`, role: ['admin', 'pm'].includes(firmView.role) ? 'manager' : 'viewer', firm_name: firmView.name, firm: true }
      : all.find((p) => p.id === current) || null
  const combined = (current === 'all' && own.length > 1) || !!firmView
  const value = {
    own, shared, firms, current, setCurrent, refresh, loaded, selected, combined,
    // Read-only for viewers of a shared portfolio and for firm analysts, compliance and viewers
    canWrite: !selected || selected.role !== 'viewer',
    // Portfolios a new trade or cash entry can go into from a combined view
    bookOptions: firmView ? firmView.portfolios : own,
    label: selected ? selected.name : own.length > 1 ? 'All my portfolios' : own[0]?.name || 'My portfolio',
    nameOf: (id) => all.find((p) => p.id === id)?.name || '',
  }
  return <PortfolioContext.Provider value={value}>{children}</PortfolioContext.Provider>
}

export function usePortfolios() {
  return useContext(PortfolioContext) || {
    own: [], shared: [], firms: [], current: 'all', setCurrent: () => {}, refresh: () => {}, loaded: false, selected: null,
    combined: false, canWrite: true, bookOptions: [], label: 'Portfolio', nameOf: () => '',
  }
}

const KIND_LABELS = { personal: 'Own', client: 'Client', model: 'Model' }

// Top-bar control: own portfolios, the combined view, and portfolios others shared
export function PortfolioSwitcher() {
  const { own, shared, firms, current, setCurrent, loaded } = usePortfolios()
  // Individual traders with one portfolio see no switcher at all
  if (!loaded || (own.length <= 1 && shared.length === 0 && firms.every((f) => f.portfolios.length === 0))) return null
  return (
    <div className="portfolio-switcher">
      <label htmlFor="portfolio-switcher" className="sr-only">Portfolio</label>
      <select id="portfolio-switcher" className="input" value={current} onChange={(e) => setCurrent(e.target.value)}
        title="Which portfolio the Portfolio, Trades, Performance and Risk pages show">
        {own.length > 1 && <option value="all">All my portfolios</option>}
        <optgroup label="My portfolios">
          {own.map((p) => (
            <option key={p.id} value={p.id}>{p.name}{p.kind !== 'personal' ? ` (${KIND_LABELS[p.kind]})` : ''}</option>
          ))}
        </optgroup>
        {firms.filter((f) => f.portfolios.length).map((f) => (
          <optgroup key={f.id} label={f.name}>
            {f.portfolios.length > 1 && <option value={`firm:${f.id}`}>All {f.name} portfolios</option>}
            {f.portfolios.map((p) => <option key={p.id} value={p.id}>{p.name}{p.client_name ? ` · ${p.client_name}` : ''}</option>)}
          </optgroup>
        ))}
        {shared.length > 0 && (
          <optgroup label="Shared with me">
            {shared.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.owner}{p.role === 'viewer' ? ' (view only)' : ''}</option>)}
          </optgroup>
        )}
      </select>
    </div>
  )
}
