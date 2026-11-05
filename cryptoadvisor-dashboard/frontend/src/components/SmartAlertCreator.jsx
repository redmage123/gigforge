import { useState } from 'react'
import { api } from '../api/client'

const EXAMPLES = [
  'Alert me when BTC drops below $60,000',
  'Tell me when gold goes above $4,300',
  'Notify me if Apple falls under $320 or Nvidia rises above $250',
]

const styles = {
  wrapper: {
    background: '#111827',
    border: '1px solid #2a2a3d',
    borderRadius: 12,
    padding: '1.5rem',
    marginTop: '1.5rem',
  },
  title: {
    color: '#7b61ff',
    fontSize: '1.1rem',
    fontWeight: 700,
    marginTop: 0,
    marginBottom: '1rem',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  textarea: {
    width: '100%',
    minHeight: 80,
    padding: '0.75rem 1rem',
    background: '#0a0e1a',
    border: '1px solid #2a2a3d',
    borderRadius: 8,
    color: '#e2e8f0',
    fontSize: '0.95rem',
    resize: 'vertical',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
  },
  examples: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.4rem',
    margin: '0.75rem 0',
  },
  example: {
    background: 'none',
    border: '1px solid #1e293b',
    borderRadius: 6,
    color: '#64748b',
    padding: '0.4rem 0.75rem',
    cursor: 'pointer',
    textAlign: 'left',
    fontSize: '0.85rem',
    transition: 'border-color 0.2s, color 0.2s',
  },
  btnRow: {
    display: 'flex',
    gap: '0.75rem',
    marginTop: '1rem',
    flexWrap: 'wrap',
  },
  primaryBtn: {
    padding: '0.5rem 1.25rem',
    background: '#7b61ff',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: '0.9rem',
  },
  secondaryBtn: {
    padding: '0.5rem 1.25rem',
    background: 'transparent',
    color: '#00d4aa',
    border: '1px solid #00d4aa',
    borderRadius: 8,
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: '0.9rem',
  },
  confirmBtn: {
    padding: '0.5rem 1.25rem',
    background: '#00d4aa',
    color: '#0a0e1a',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    fontWeight: 700,
    fontSize: '0.9rem',
  },
  conditionCard: {
    background: '#0a0e1a',
    border: '1px solid #2a2a3d',
    borderRadius: 8,
    padding: '0.75rem 1rem',
    marginBottom: '0.5rem',
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    flexWrap: 'wrap',
  },
  badge: {
    fontSize: '0.75rem',
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: 4,
    background: '#1e293b',
    color: '#e2e8f0',
  },
  suggestCard: {
    background: '#0a0e1a',
    border: '1px solid #1e293b',
    borderRadius: 8,
    padding: '0.75rem 1rem',
    marginBottom: '0.5rem',
    cursor: 'pointer',
    transition: 'border-color 0.2s',
    color: '#e2e8f0',
    fontSize: '0.9rem',
  },
  error: {
    color: '#ff6b6b',
    marginTop: '0.75rem',
    fontSize: '0.9rem',
  },
  loading: {
    color: '#7b61ff',
    padding: '1rem 0',
    animation: 'pulse 1.5s ease-in-out infinite',
  },
  sectionTitle: {
    color: '#e2e8f0',
    fontSize: '0.95rem',
    fontWeight: 600,
    marginTop: '1.25rem',
    marginBottom: '0.5rem',
  },
}

// The AI answers with names or tickers ("BTC", "gold", "Apple"): resolve each via instrument search
async function resolveInstrument(name) {
  const res = await api.get(`/api/instruments/search?q=${encodeURIComponent(String(name || '').trim())}&limit=1`)
  return res.results?.[0] || null
}

export default function SmartAlertCreator({ onSaved } = {}) {
  const [text, setText] = useState('')
  const [parsed, setParsed] = useState(null)
  const [suggestions, setSuggestions] = useState(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const parseAlert = async () => {
    if (!text.trim()) return
    setLoading(true)
    setError('')
    setParsed(null)
    setSuccess('')
    try {
      const res = await api.post('/api/ai/smart-alerts/parse', { condition: text })
      setParsed(res.conditions || res.alerts || res)
    } catch (err) {
      setError(err.message || 'Failed to parse alert')
    } finally {
      setLoading(false)
    }
  }

  const saveAlert = async () => {
    setSaving(true)
    setError('')
    try {
      // The alert store only supports price above/below; save those, report the rest honestly
      const conds = Array.isArray(parsed) ? parsed : parsed?.conditions || []
      const priceConds = conds.filter((c) => c.metric === 'price' && ['gt', 'lt'].includes(c.operator) && Number(c.value) > 0)
      const skipped = conds.length - priceConds.length
      if (!priceConds.length) {
        setError('Only price above/below conditions can be saved as alerts for now. Try e.g. "Alert me when BTC goes above $90,000".')
        return
      }
      for (const c of priceConds) {
        const inst = await resolveInstrument(c.coin)
        if (!inst) throw new Error(`Couldn't find "${c.coin}". Try its ticker, e.g. AAPL, BTC or GC.`)
        await api.post('/api/alerts/', {
          instrument_id: inst.id,
          direction: c.operator === 'gt' ? 'above' : 'below',
          target_price: Number(c.value),
          notes: text,
        })
      }
      setSuccess(`Saved ${priceConds.length} price alert${priceConds.length > 1 ? 's' : ''}.` +
        (skipped ? ` ${skipped} condition${skipped > 1 ? 's' : ''} (volume, gas or % change) can't be saved as alerts yet.` : ''))
      setParsed(null)
      setText('')
      onSaved?.()
    } catch (err) {
      setError(err.message || 'Failed to save alert')
    } finally {
      setSaving(false)
    }
  }

  const getSuggestions = async () => {
    setLoading(true)
    setError('')
    setSuggestions(null)
    try {
      const res = await api.post('/api/ai/smart-alerts/suggest', {})
      setSuggestions(res.suggestions || res.alerts || res)
    } catch (err) {
      setError(err.message || 'Failed to get suggestions')
    } finally {
      setLoading(false)
    }
  }

  const parsedArr = parsed ? (Array.isArray(parsed) ? parsed : [parsed]) : []
  const suggestArr = suggestions ? (Array.isArray(suggestions) ? suggestions : [suggestions]) : []

  return (
    <div style={styles.wrapper}>
      <h3 style={styles.title}>{'\u2728'} Smart Alert Creator</h3>

      <textarea
        style={styles.textarea}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Describe your alert condition in plain English..."
      />

      <div style={styles.examples}>
        <span style={{ color: '#64748b', fontSize: '0.8rem', fontWeight: 600 }}>Examples:</span>
        {EXAMPLES.map((ex, i) => (
          <button
            key={i}
            style={styles.example}
            onClick={() => setText(ex)}
            onMouseEnter={(e) => { e.target.style.borderColor = '#7b61ff'; e.target.style.color = '#e2e8f0' }}
            onMouseLeave={(e) => { e.target.style.borderColor = '#1e293b'; e.target.style.color = '#64748b' }}
          >
            "{ex}"
          </button>
        ))}
      </div>

      <div style={styles.btnRow}>
        <button style={styles.primaryBtn} onClick={parseAlert} disabled={loading || !text.trim()}>
          {loading ? 'Parsing...' : 'Create Smart Alert'}
        </button>
        <button style={styles.secondaryBtn} onClick={getSuggestions} disabled={loading}>
          Get Suggestions
        </button>
      </div>

      {error && <p style={styles.error}>{error}</p>}
      {success && <p style={{ color: '#00d4aa', marginTop: '0.75rem', fontSize: '0.9rem' }}>{success}</p>}

      {loading && <div style={styles.loading}>Processing...</div>}

      {parsedArr.length > 0 && (
        <div>
          <p style={styles.sectionTitle}>Parsed Conditions:</p>
          {parsedArr.map((c, i) => (
            <div key={i} style={styles.conditionCard}>
              {c.coin && <span style={{ ...styles.badge, background: '#7b61ff', color: '#fff' }}>{c.coin}</span>}
              {c.metric && <span style={styles.badge}>{c.metric}</span>}
              {c.operator && <span style={{ color: '#00d4aa', fontWeight: 600 }}>{c.operator}</span>}
              {c.value != null && <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{c.value}</span>}
              {c.description && <span style={{ color: '#64748b', fontSize: '0.85rem' }}>{c.description}</span>}
            </div>
          ))}
          <div style={{ marginTop: '0.75rem' }}>
            <button style={styles.confirmBtn} onClick={saveAlert} disabled={saving}>
              {saving ? 'Saving...' : 'Confirm & Save'}
            </button>
          </div>
        </div>
      )}

      {suggestArr.length > 0 && (
        <div>
          <p style={styles.sectionTitle}>Suggested Alerts:</p>
          {suggestArr.map((s, i) => (
            <div
              key={i}
              style={styles.suggestCard}
              onClick={() => setText(s.description || s.text || s.condition || JSON.stringify(s))}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#7b61ff' }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#1e293b' }}
            >
              {s.description || s.text || s.condition || JSON.stringify(s)}
            </div>
          ))}
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  )
}
