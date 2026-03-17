const styles = {
  wrapper: {
    marginBottom: '1.5rem',
    borderRadius: 12,
    padding: 2,
    background: 'linear-gradient(135deg, #7b61ff, #00d4aa)',
  },
  inner: {
    background: '#111827',
    borderRadius: 10,
    padding: '1.25rem',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '0.75rem',
  },
  title: {
    color: '#7b61ff',
    fontSize: '1rem',
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    margin: 0,
  },
  controls: {
    display: 'flex',
    gap: '0.5rem',
  },
  refreshBtn: {
    background: 'none',
    border: '1px solid #7b61ff',
    color: '#7b61ff',
    borderRadius: 6,
    padding: '0.3rem 0.75rem',
    cursor: 'pointer',
    fontSize: '0.8rem',
    fontWeight: 600,
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: '#64748b',
    fontSize: '1.2rem',
    cursor: 'pointer',
    padding: '0.25rem',
    lineHeight: 1,
  },
  content: {
    color: '#e2e8f0',
    lineHeight: 1.7,
    fontSize: '0.93rem',
  },
  placeholder: {
    color: '#64748b',
    fontStyle: 'italic',
    fontSize: '0.9rem',
    textAlign: 'center',
    padding: '0.5rem 0',
  },
  skeletonLine: {
    height: 14,
    borderRadius: 4,
    background: '#1e293b',
    marginBottom: 10,
    animation: 'skeletonPulse 1.5s ease-in-out infinite',
  },
}

function formatContent(text) {
  if (!text) return null
  return text.split('\n').map((line, i) => {
    const trimmed = line.trim()
    // Bullet points
    if (trimmed.startsWith('- ') || trimmed.startsWith('\u2022 ')) {
      const inner = trimmed.replace(/^[-\u2022]\s*/, '')
      const formatted = inner.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      return (
        <div key={i} style={{ paddingLeft: '1rem', margin: '0.25rem 0', color: '#e2e8f0' }}>
          <span style={{ color: '#00d4aa', marginRight: '0.5rem' }}>{'\u2022'}</span>
          <span dangerouslySetInnerHTML={{ __html: formatted }} />
        </div>
      )
    }
    // Numbered lists
    const numMatch = trimmed.match(/^(\d+)[.)]\s+(.*)/)
    if (numMatch) {
      const formatted = numMatch[2].replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      return (
        <div key={i} style={{ paddingLeft: '1rem', margin: '0.25rem 0', color: '#e2e8f0' }}>
          <span style={{ color: '#00d4aa', marginRight: '0.5rem', fontWeight: 600 }}>{numMatch[1]}.</span>
          <span dangerouslySetInnerHTML={{ __html: formatted }} />
        </div>
      )
    }
    // Regular lines
    const formatted = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    return (
      <p key={i} style={{ margin: '0.3rem 0' }} dangerouslySetInnerHTML={{ __html: formatted }} />
    )
  })
}

export default function AiInsightPanel({ title, content, loading, onRefresh, onClose }) {
  return (
    <div style={styles.wrapper}>
      <div style={styles.inner}>
        <div style={styles.header}>
          <h3 style={styles.title}>{'\u2728'} {title || 'AI Insights'}</h3>
          <div style={styles.controls}>
            {onRefresh && (
              <button style={styles.refreshBtn} onClick={onRefresh} disabled={loading}>
                {loading ? 'Loading...' : 'Refresh'}
              </button>
            )}
            {onClose && (
              <button style={styles.closeBtn} onClick={onClose}>&times;</button>
            )}
          </div>
        </div>

        {loading ? (
          <div>
            <div style={{ ...styles.skeletonLine, width: '90%' }} />
            <div style={{ ...styles.skeletonLine, width: '75%' }} />
            <div style={{ ...styles.skeletonLine, width: '85%' }} />
          </div>
        ) : content ? (
          <div style={styles.content}>
            {formatContent(content)}
          </div>
        ) : (
          <p style={styles.placeholder}>Click AI Analysis to get insights</p>
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
