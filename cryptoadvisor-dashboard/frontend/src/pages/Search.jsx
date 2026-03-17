import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../api/client'
import Card from '../components/Card'
import LoadingSpinner from '../components/LoadingSpinner'

const CATEGORIES = ['', 'news', 'analysis', 'market_data', 'alert', 'conversation', 'fundamentals', 'trade', 'research']

function timeAgo(ts) {
  if (!ts) return ''
  const diff = Date.now() / 1000 - ts
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

const categoryColors = {
  news: '#4ecdc4',
  analysis: '#7b61ff',
  market_data: '#00d4aa',
  alert: '#ff6b6b',
  conversation: '#ffd93d',
  fundamentals: '#4ade80',
  trade: '#fb923c',
  research: '#818cf8',
  general: '#64748b',
}

export default function Search() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [query, setQuery] = useState(searchParams.get('q') || '')
  const [category, setCategory] = useState(searchParams.get('category') || '')
  const [results, setResults] = useState([])
  const [memoryResults, setMemoryResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [aiAnswer, setAiAnswer] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [stats, setStats] = useState(null)
  const [expanded, setExpanded] = useState(null)

  // Load stats on mount
  useEffect(() => {
    api.get('/api/search/stats').then(setStats).catch(() => {})
  }, [])

  // Search on URL params change
  useEffect(() => {
    const q = searchParams.get('q')
    if (q) {
      setQuery(q)
      doSearch(q, searchParams.get('category') || '')
    }
  }, [searchParams])

  const doSearch = useCallback(async (q, cat) => {
    if (!q || q.length < 2) return
    setLoading(true)
    setAiAnswer('')
    try {
      const params = new URLSearchParams({ q, limit: '30' })
      if (cat) params.append('category', cat)
      const res = await api.get(`/api/search?${params}`)
      setResults(res.results || [])
      setMemoryResults(res.memory_results || [])
    } catch {}
    setLoading(false)
  }, [])

  const handleSearch = (e) => {
    e.preventDefault()
    if (query.trim().length < 2) return
    setSearchParams({ q: query, ...(category ? { category } : {}) })
    doSearch(query, category)
  }

  const askAI = async () => {
    setAiLoading(true)
    try {
      const res = await api.post('/api/search/ask', { question: query })
      setAiAnswer(res.answer || 'No answer available.')
    } catch {
      setAiAnswer('Error getting AI answer.')
    }
    setAiLoading(false)
  }

  return (
    <div>
      <h2 style={{ color: '#e0e0e0', marginBottom: '1rem' }}>Search</h2>

      {/* Search form */}
      <form onSubmit={handleSearch}>
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <input
            className="form-input"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search news, analysis, alerts, trades..."
            style={{ flex: 1, minWidth: 200, fontSize: '1rem', padding: '0.75rem 1rem' }}
            autoFocus
          />
          <select
            className="form-input"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            style={{ width: 'auto' }}
          >
            <option value="">All categories</option>
            {CATEGORIES.filter(Boolean).map((c) => (
              <option key={c} value={c}>{c.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</option>
            ))}
          </select>
          <button className="btn" type="submit" disabled={loading || query.length < 2}>
            {loading ? 'Searching...' : 'Search'}
          </button>
        </div>
      </form>

      {/* Stats bar */}
      {stats && !loading && results.length === 0 && !query && (
        <Card title="Knowledge Base">
          <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--primary)' }}>{stats.total_documents}</div>
              <div className="muted">Indexed documents</div>
            </div>
            {stats.by_category && Object.entries(stats.by_category).map(([cat, count]) => (
              <div key={cat}>
                <div style={{ fontSize: '1.2rem', fontWeight: 600, color: categoryColors[cat] || '#e2e8f0' }}>{count}</div>
                <div className="muted" style={{ fontSize: '0.8rem' }}>{cat.replace(/_/g, ' ')}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {loading && <LoadingSpinner />}

      {/* Results */}
      {results.length > 0 && (
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <span className="muted">{results.length} results for "{query}"</span>
            <button className="btn btn-outline btn-sm" onClick={askAI} disabled={aiLoading}>
              {aiLoading ? 'Asking AI...' : 'Ask AI'}
            </button>
          </div>

          {/* AI Answer */}
          {aiAnswer && (
            <Card className="mb-1">
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                <span style={{ fontSize: '1.2rem' }}>&#x1F916;</span>
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--primary)', marginBottom: '0.5rem' }}>AI Answer</div>
                  <div style={{ color: '#e2e8f0', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{aiAnswer}</div>
                </div>
              </div>
            </Card>
          )}

          {results.map((r) => (
            <div
              key={r.id}
              className="card"
              style={{
                padding: '1rem 1.25rem',
                marginBottom: '0.5rem',
                borderLeft: `3px solid ${categoryColors[r.category] || '#64748b'}`,
                cursor: 'pointer',
              }}
              onClick={() => setExpanded(expanded === r.id ? null : r.id)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                <span style={{
                  background: `${categoryColors[r.category] || '#64748b'}22`,
                  color: categoryColors[r.category] || '#64748b',
                  padding: '0.15rem 0.5rem',
                  borderRadius: 6,
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                }}>
                  {r.category}
                </span>
                <strong style={{ color: '#e2e8f0', flex: 1 }}>{r.title || r.content.slice(0, 80)}</strong>
                <span className="muted" style={{ fontSize: '0.75rem' }}>{timeAgo(r.created_at)}</span>
                <span className="muted" style={{ fontSize: '0.75rem' }}>{r.source}</span>
              </div>
              {r.content && (
                <div className="muted" style={{ fontSize: '0.85rem', marginTop: '0.4rem', lineHeight: 1.5 }}>
                  {expanded === r.id ? r.full_content : r.content}
                </div>
              )}
              {r.tags && r.tags.length > 0 && (
                <div style={{ display: 'flex', gap: '0.3rem', marginTop: '0.4rem', flexWrap: 'wrap' }}>
                  {r.tags.map((tag) => (
                    <span key={tag} style={{
                      background: '#1f293766',
                      color: '#94a3b8',
                      padding: '0.1rem 0.4rem',
                      borderRadius: 6,
                      fontSize: '0.7rem',
                    }}>
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Memory results */}
      {memoryResults.length > 0 && (
        <Card title="From Your Memory" className="mt-1">
          {memoryResults.map((fact, i) => (
            <div key={i} style={{
              padding: '0.5rem 0',
              borderBottom: i < memoryResults.length - 1 ? '1px solid #1f2937' : 'none',
              color: '#e2e8f0',
              fontSize: '0.9rem',
            }}>
              {typeof fact === 'string' ? fact : fact.fact || JSON.stringify(fact)}
            </div>
          ))}
        </Card>
      )}

      {!loading && results.length === 0 && query.length >= 2 && (
        <Card>
          <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
            <p>No results found for "{query}"</p>
            <p style={{ fontSize: '0.85rem' }}>Try different keywords or wait for more data to be indexed.</p>
          </div>
        </Card>
      )}
    </div>
  )
}
