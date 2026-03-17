import { useState } from 'react'
import { api } from '../api/client'

const styles = {
  button: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.4rem',
    padding: '0.4rem 1rem',
    background: '#7b61ff',
    color: '#fff',
    border: 'none',
    borderRadius: 20,
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: '0.85rem',
    whiteSpace: 'nowrap',
    transition: 'opacity 0.2s',
  },
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '1rem',
  },
  panel: {
    background: '#111827',
    border: '2px solid #7b61ff',
    borderRadius: 12,
    padding: '1.5rem',
    maxWidth: 640,
    width: '100%',
    maxHeight: '80vh',
    overflowY: 'auto',
    position: 'relative',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '1rem',
  },
  title: {
    color: '#7b61ff',
    fontSize: '1.1rem',
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    margin: 0,
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: '#64748b',
    fontSize: '1.4rem',
    cursor: 'pointer',
    padding: '0.25rem',
    lineHeight: 1,
  },
  content: {
    color: '#e2e8f0',
    lineHeight: 1.7,
    fontSize: '0.95rem',
  },
  loading: {
    color: '#7b61ff',
    textAlign: 'center',
    padding: '2rem',
    fontSize: '1rem',
    animation: 'pulse 1.5s ease-in-out infinite',
  },
  error: {
    color: '#ff6b6b',
    marginBottom: '1rem',
  },
  retryBtn: {
    padding: '0.4rem 1rem',
    background: '#ff6b6b',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: '0.85rem',
  },
}

function formatAiText(text) {
  if (!text) return null
  return text.split('\n').map((line, i) => {
    const formatted = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    return (
      <p key={i} style={{ margin: '0.3rem 0' }} dangerouslySetInnerHTML={{ __html: formatted }} />
    )
  })
}

export default function AiAnalysisButton({ endpoint, body, label = 'AI Analysis', onResult }) {
  const [open, setOpen] = useState(false)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const runAnalysis = async () => {
    setLoading(true)
    setError('')
    setResult(null)
    setOpen(true)
    try {
      const res = await api.post(endpoint, body || {})
      const text = typeof res === 'string' ? res : res.analysis || res.result || res.content || res.message || JSON.stringify(res, null, 2)
      setResult(text)
      if (onResult) onResult(text)
    } catch (err) {
      setError(err.message || 'Analysis failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button style={styles.button} onClick={runAnalysis} disabled={loading}>
        {'\u2728'} {label}
      </button>

      {open && (
        <div style={styles.overlay} onClick={() => setOpen(false)}>
          <div style={styles.panel} onClick={(e) => e.stopPropagation()}>
            <div style={styles.header}>
              <h3 style={styles.title}>{'\u2728'} AI Analysis</h3>
              <button style={styles.closeBtn} onClick={() => setOpen(false)}>&times;</button>
            </div>

            {loading && (
              <div style={styles.loading}>Analyzing...</div>
            )}

            {error && (
              <div>
                <p style={styles.error}>{error}</p>
                <button style={styles.retryBtn} onClick={runAnalysis}>Retry</button>
              </div>
            )}

            {result && (
              <div style={styles.content}>
                {formatAiText(result)}
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </>
  )
}
