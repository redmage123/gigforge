import { useState, useEffect } from 'react'
import { api } from '../api/client'
import AiInsightPanel from '../components/AiInsightPanel'

const COINS = ['bitcoin', 'ethereum', 'solana', 'cardano', 'polkadot', 'avalanche-2', 'chainlink', 'dogecoin']

const styles = {
  card: {
    background: '#111827',
    border: '1px solid #2a2a3d',
    borderRadius: 12,
    padding: '1.5rem',
    marginBottom: '1.5rem',
  },
  title: {
    color: '#e2e8f0',
    fontSize: '1rem',
    fontWeight: 700,
    marginTop: 0,
    marginBottom: '1rem',
  },
  timestamp: {
    color: '#64748b',
    fontSize: '0.8rem',
    fontWeight: 400,
    marginLeft: '0.75rem',
  },
  refreshBtn: {
    padding: '0.5rem 1.25rem',
    background: '#7b61ff',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: '0.9rem',
    marginBottom: '1.5rem',
  },
  coinSection: {
    marginTop: '2rem',
    paddingTop: '1.5rem',
    borderTop: '1px solid #2a2a3d',
  },
  select: {
    padding: '0.5rem 1rem',
    background: '#0a0e1a',
    border: '1px solid #2a2a3d',
    borderRadius: 8,
    color: '#e2e8f0',
    fontSize: '0.95rem',
    marginRight: '0.75rem',
  },
  commentaryBtn: {
    padding: '0.5rem 1.25rem',
    background: '#00d4aa',
    color: '#0a0e1a',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    fontWeight: 700,
    fontSize: '0.9rem',
  },
  skeleton: {
    height: 14,
    borderRadius: 4,
    background: '#1e293b',
    marginBottom: 10,
    animation: 'skeletonPulse 1.5s ease-in-out infinite',
  },
  error: {
    color: '#ff6b6b',
    marginTop: '0.75rem',
  },
}

export default function AiBriefing() {
  const [briefing, setBriefing] = useState(null)
  const [briefingTime, setBriefingTime] = useState(null)
  const [loadingBriefing, setLoadingBriefing] = useState(true)
  const [briefingError, setBriefingError] = useState('')

  const [coin, setCoin] = useState('bitcoin')
  const [commentary, setCommentary] = useState(null)
  const [loadingCommentary, setLoadingCommentary] = useState(false)
  const [commentaryError, setCommentaryError] = useState('')

  const fetchBriefing = async () => {
    setLoadingBriefing(true)
    setBriefingError('')
    try {
      const res = await api.get('/api/ai/briefing')
      const text = typeof res === 'string' ? res : res.briefing || res.content || res.message || JSON.stringify(res, null, 2)
      setBriefing(text)
      setBriefingTime(res.timestamp || res.generated_at || new Date().toISOString())
    } catch (err) {
      setBriefingError(err.message || 'Failed to load briefing')
    } finally {
      setLoadingBriefing(false)
    }
  }

  const fetchCommentary = async () => {
    setLoadingCommentary(true)
    setCommentaryError('')
    setCommentary(null)
    try {
      const res = await api.get(`/api/ai/briefing/${coin}`)
      const text = typeof res === 'string' ? res : res.commentary || res.content || res.message || JSON.stringify(res, null, 2)
      setCommentary(text)
    } catch (err) {
      setCommentaryError(err.message || 'Failed to load commentary')
    } finally {
      setLoadingCommentary(false)
    }
  }

  useEffect(() => { fetchBriefing() }, [])

  const formatTime = (ts) => {
    if (!ts) return ''
    try {
      return new Date(ts).toLocaleString()
    } catch { return ts }
  }

  return (
    <div>
      <h1 style={{ color: '#e2e8f0', marginBottom: '1rem' }}>
        {'\u2728'} Daily AI Market Briefing
      </h1>

      <button style={styles.refreshBtn} onClick={fetchBriefing} disabled={loadingBriefing}>
        {loadingBriefing ? 'Loading...' : 'Refresh Briefing'}
      </button>

      {briefingError && <p style={styles.error}>{briefingError}</p>}

      <AiInsightPanel
        title={`Market Briefing${briefingTime ? '' : ''}`}
        content={briefing}
        loading={loadingBriefing}
        onRefresh={fetchBriefing}
      />

      {briefingTime && !loadingBriefing && (
        <p style={{ color: '#64748b', fontSize: '0.8rem', marginTop: '-1rem', marginBottom: '1rem' }}>
          Generated: {formatTime(briefingTime)}
        </p>
      )}

      <div style={styles.coinSection}>
        <h2 style={{ color: '#e2e8f0', fontSize: '1.1rem', marginBottom: '1rem' }}>Coin Commentary</h2>
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
          <select style={styles.select} value={coin} onChange={(e) => setCoin(e.target.value)}>
            {COINS.map((c) => (
              <option key={c} value={c}>{c.replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}</option>
            ))}
          </select>
          <button style={styles.commentaryBtn} onClick={fetchCommentary} disabled={loadingCommentary}>
            {loadingCommentary ? 'Loading...' : 'Get Commentary'}
          </button>
        </div>

        {commentaryError && <p style={styles.error}>{commentaryError}</p>}

        {(commentary || loadingCommentary) && (
          <AiInsightPanel
            title={`${coin.replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())} Commentary`}
            content={commentary}
            loading={loadingCommentary}
            onRefresh={fetchCommentary}
          />
        )}
      </div>

      <style>{`
        @keyframes skeletonPulse {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 0.7; }
        }
      `}</style>
    </div>
  )
}
