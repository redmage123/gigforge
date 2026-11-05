import { useEffect, useRef, useState } from 'react'
import { api } from '../api/client'
import { ClassBadge } from './assetClass'

// Search any instrument (stocks, ETFs, crypto, commodities, bonds) by symbol or name.
// value: the selected instrument object (from /api/instruments) or null; onChange(instrument | null).
export default function InstrumentPicker({ id, value, onChange, tradableOnly = true, classes = '', placeholder, autoFocus }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [error, setError] = useState('')
  const timer = useRef(null)
  const listId = `${id || 'instrument'}-list`

  useEffect(() => {
    clearTimeout(timer.current)
    const q = query.trim()
    if (!q) { setResults([]); return }
    timer.current = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q, limit: '12', tradable: String(tradableOnly) })
        if (classes) params.set('classes', classes)
        const res = await api.get(`/api/instruments/search?${params}`)
        setResults(res.results || [])
        setActive(0)
        setOpen(true)
        setError('')
      } catch (err) {
        setError(err.message)
      }
    }, 200)
    return () => clearTimeout(timer.current)
  }, [query, tradableOnly, classes])

  const pick = (inst) => {
    onChange(inst)
    setQuery('')
    setResults([])
    setOpen(false)
  }

  const onKey = (e) => {
    if (!open || !results.length) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); pick(results[active]) }
    else if (e.key === 'Escape') setOpen(false)
  }

  if (value) {
    return (
      <div className="instrument-picked" style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <ClassBadge cls={value.asset_class} />
        <strong>{value.symbol}</strong>
        <span className="muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value.name}</span>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => onChange(null)} aria-label="Change instrument">Change</button>
      </div>
    )
  }

  return (
    <div style={{ position: 'relative' }}>
      <input
        id={id}
        className="input"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        autoFocus={autoFocus}
        placeholder={placeholder || 'Search: AAPL, gold, bitcoin, TLT, 10-year…'}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onKey}
        onFocus={() => results.length && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        style={{ width: '100%', boxSizing: 'border-box' }}
      />
      {error && <div className="negative" style={{ fontSize: '0.8rem' }}>{error}</div>}
      {open && query.trim() && (
        <ul id={listId} role="listbox" className="instrument-results" style={{
          position: 'absolute', zIndex: 50, left: 0, right: 0, top: '100%', marginTop: 4, padding: 4, listStyle: 'none',
          background: 'var(--card, #12121f)', border: '1px solid var(--border, #2a2a3d)', borderRadius: 8, maxHeight: 320, overflowY: 'auto',
        }}>
          {results.length === 0 && <li className="muted" style={{ padding: '0.5rem' }}>No matches</li>}
          {results.map((r, i) => (
            <li
              key={r.id}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => { e.preventDefault(); pick(r) }}
              onMouseEnter={() => setActive(i)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '0.45rem 0.5rem', borderRadius: 6, cursor: 'pointer',
                background: i === active ? 'rgba(100,108,255,0.15)' : 'transparent',
              }}
            >
              <ClassBadge cls={r.asset_class} />
              <strong style={{ minWidth: 56 }}>{r.symbol}</strong>
              <span className="muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{r.name}</span>
              {r.exchange && <span className="muted" style={{ fontSize: '0.75rem' }}>{r.exchange}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
