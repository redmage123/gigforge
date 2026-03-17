import { useState, useEffect } from 'react'
import { api } from '../api/client'

const CATEGORY_LABELS = {
  portfolio: 'Portfolio',
  strategy: 'Strategy',
  risk_profile: 'Risk Profile',
  goals: 'Goals',
  preferences: 'Preferences',
  knowledge: 'Knowledge',
  market_views: 'Market Views',
  personal: 'Personal',
  general: 'General',
}

const CATEGORY_COLORS = {
  portfolio: '#00d4aa',
  strategy: '#7b61ff',
  risk_profile: '#ff6b6b',
  goals: '#ffd93d',
  preferences: '#4ecdc4',
  knowledge: '#ff9f43',
  market_views: '#a29bfe',
  personal: '#fd79a8',
  general: '#636e72',
}

function Memory() {
  const [facts, setFacts] = useState([])
  const [stats, setStats] = useState(null)
  const [filter, setFilter] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState(null)
  const [newFact, setNewFact] = useState('')
  const [newCategory, setNewCategory] = useState('general')
  const [editingId, setEditingId] = useState(null)
  const [editText, setEditText] = useState('')
  const [editCategory, setEditCategory] = useState('')
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const [factsRes, statsRes] = await Promise.all([
        api.get(`/api/memory/${filter ? `?category=${filter}` : ''}`),
        api.get('/api/memory/stats'),
      ])
      setFacts(factsRes?.facts || [])
      setStats(statsRes)
    } catch (e) {
      console.error('Failed to load memory:', e)
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [filter])

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchResults(null)
      return
    }
    try {
      const res = await api.post('/api/memory/search', { query: searchQuery, limit: 20 })
      setSearchResults(res?.results || [])
    } catch (e) {
      console.error('Search failed:', e)
    }
  }

  const handleAdd = async () => {
    if (!newFact.trim()) return
    try {
      await api.post('/api/memory/', { fact: newFact.trim(), category: newCategory })
      setNewFact('')
      setNewCategory('general')
      load()
    } catch (e) {
      console.error('Failed to add fact:', e)
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this fact?')) return
    try {
      await api.delete(`/api/memory/${id}`)
      load()
      if (searchResults) {
        setSearchResults(searchResults.filter(f => f.id !== id))
      }
    } catch (e) {
      console.error('Failed to delete:', e)
    }
  }

  const handleDeleteAll = async () => {
    if (!confirm('Delete ALL your stored facts? This cannot be undone.')) return
    try {
      await api.delete('/api/memory/')
      load()
      setSearchResults(null)
    } catch (e) {
      console.error('Failed to clear:', e)
    }
  }

  const startEdit = (fact) => {
    setEditingId(fact.id)
    setEditText(fact.fact)
    setEditCategory(fact.category)
  }

  const saveEdit = async () => {
    if (!editText.trim()) return
    try {
      await api.put(`/api/memory/${editingId}`, {
        fact: editText.trim(),
        category: editCategory,
      })
      setEditingId(null)
      load()
    } catch (e) {
      console.error('Failed to update:', e)
    }
  }

  const displayFacts = searchResults !== null ? searchResults : facts

  return (
    <div className="page-container">
      <div className="page-header">
        <h2>AI Memory</h2>
        <p className="page-subtitle">
          Facts the AI remembers about you to personalize advice. The AI learns
          from your conversations automatically, or you can add facts manually.
        </p>
      </div>

      {/* Stats bar */}
      {stats && (
        <div className="memory-stats-bar">
          <div className="memory-stat">
            <span className="memory-stat-value">{stats.total_facts}</span>
            <span className="memory-stat-label">Total Facts</span>
          </div>
          <div className="memory-stat">
            <span className="memory-stat-value">
              {Object.keys(stats.by_category || {}).length}
            </span>
            <span className="memory-stat-label">Categories</span>
          </div>
          {stats.oldest_fact && (
            <div className="memory-stat">
              <span className="memory-stat-value">
                {new Date(stats.oldest_fact + 'Z').toLocaleDateString()}
              </span>
              <span className="memory-stat-label">Since</span>
            </div>
          )}
        </div>
      )}

      {/* Category filter pills */}
      <div className="memory-filters">
        <button
          className={`memory-filter-pill ${filter === null ? 'active' : ''}`}
          onClick={() => { setFilter(null); setSearchResults(null) }}
        >
          All
        </button>
        {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
          <button
            key={key}
            className={`memory-filter-pill ${filter === key ? 'active' : ''}`}
            style={filter === key ? { background: CATEGORY_COLORS[key], borderColor: CATEGORY_COLORS[key] } : {}}
            onClick={() => { setFilter(key); setSearchResults(null) }}
          >
            {label}
            {stats?.by_category?.[key] ? ` (${stats.by_category[key]})` : ''}
          </button>
        ))}
      </div>

      {/* Search bar */}
      <div className="memory-search-bar">
        <input
          type="text"
          placeholder="Search your memories..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
          className="memory-search-input"
        />
        <button className="btn btn-secondary" onClick={handleSearch}>Search</button>
        {searchResults !== null && (
          <button
            className="btn btn-ghost"
            onClick={() => { setSearchResults(null); setSearchQuery('') }}
          >
            Clear
          </button>
        )}
      </div>

      {/* Add new fact */}
      <div className="memory-add-form">
        <div className="memory-add-row">
          <input
            type="text"
            placeholder="Add a fact about yourself (e.g., 'I hold 2 BTC and plan to HODL for 5 years')"
            value={newFact}
            onChange={e => setNewFact(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            className="memory-add-input"
          />
          <select
            value={newCategory}
            onChange={e => setNewCategory(e.target.value)}
            className="memory-category-select"
          >
            {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
          <button className="btn btn-primary" onClick={handleAdd} disabled={!newFact.trim()}>
            Add
          </button>
        </div>
      </div>

      {/* Facts list */}
      {loading ? (
        <div className="loading-spinner">Loading...</div>
      ) : displayFacts.length === 0 ? (
        <div className="empty-state">
          <p>
            {searchResults !== null
              ? 'No matching facts found.'
              : 'No facts stored yet. Chat with the AI or add facts manually above.'}
          </p>
        </div>
      ) : (
        <div className="memory-facts-list">
          {searchResults !== null && (
            <div className="memory-search-info">
              Found {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
            </div>
          )}
          {displayFacts.map(fact => (
            <div key={fact.id} className="memory-fact-card">
              {editingId === fact.id ? (
                <div className="memory-edit-form">
                  <input
                    type="text"
                    value={editText}
                    onChange={e => setEditText(e.target.value)}
                    className="memory-edit-input"
                    autoFocus
                  />
                  <select
                    value={editCategory}
                    onChange={e => setEditCategory(e.target.value)}
                    className="memory-category-select"
                  >
                    {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                  <button className="btn btn-primary btn-sm" onClick={saveEdit}>Save</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditingId(null)}>Cancel</button>
                </div>
              ) : (
                <>
                  <div className="memory-fact-content">
                    <span
                      className="memory-category-badge"
                      style={{ background: CATEGORY_COLORS[fact.category] || '#636e72' }}
                    >
                      {CATEGORY_LABELS[fact.category] || fact.category}
                    </span>
                    <span className="memory-fact-text">{fact.fact}</span>
                  </div>
                  <div className="memory-fact-meta">
                    <span className="memory-fact-source">{fact.source}</span>
                    <span className="memory-fact-date">
                      {new Date(fact.created_at + 'Z').toLocaleDateString()}
                    </span>
                    {fact.access_count > 0 && (
                      <span className="memory-fact-accessed">
                        Used {fact.access_count}x
                      </span>
                    )}
                    <button className="memory-action-btn" onClick={() => startEdit(fact)} title="Edit">
                      &#9998;
                    </button>
                    <button className="memory-action-btn memory-delete-btn" onClick={() => handleDelete(fact.id)} title="Delete">
                      &#10005;
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Clear all button */}
      {stats && stats.total_facts > 0 && (
        <div className="memory-footer">
          <button className="btn btn-danger btn-sm" onClick={handleDeleteAll}>
            Clear All Memory
          </button>
        </div>
      )}
    </div>
  )
}

export default Memory
