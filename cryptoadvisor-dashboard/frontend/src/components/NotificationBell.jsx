import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'

const SEEN_KEY = 'inplay_seen_at'

// Storage can throw (Safari private mode, blocked site data) — never let that break the UI.
function readSeen() {
  try {
    return Number(window.localStorage.getItem(SEEN_KEY)) || 0
  } catch {
    return 0
  }
}

export function markInPlaySeen(entries) {
  const newest = Math.max(0, ...(entries || []).map((e) => e.triggered_at))
  try {
    window.localStorage.setItem(SEEN_KEY, String(newest))
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event('inplay-seen'))
}

export default function NotificationBell() {
  const navigate = useNavigate()
  const [count, setCount] = useState(0)

  useEffect(() => {
    const load = async () => {
      try {
        const [ip, n] = await Promise.all([api.get('/api/in-play/'), api.get('/api/notifications/?unread_only=true')])
        const seen = readSeen()
        const fresh = (ip.entries || []).filter((e) => e.triggered_at > seen).length
        setCount(fresh + (n.unread_count || 0))
      } catch {
        /* badge is best-effort */
      }
    }
    load()
    const id = setInterval(load, 60000)
    window.addEventListener('inplay-seen', load)
    return () => {
      clearInterval(id)
      window.removeEventListener('inplay-seen', load)
    }
  }, [])

  return (
    <button
      className="guide-help-btn"
      onClick={() => navigate('/notifications')}
      title="Notifications & in-play coins"
      aria-label={`Notifications${count ? ` (${count} new)` : ''}`}
      style={{ position: 'relative' }}
    >
      {'🔔'}
      {count > 0 && (
        <span style={{
          position: 'absolute', top: -4, right: -4, minWidth: 16, height: 16, padding: '0 4px',
          borderRadius: 8, background: '#ef4444', color: '#fff', fontSize: '0.65rem', lineHeight: '16px',
        }}>
          {count > 99 ? '99+' : count}
        </span>
      )}
    </button>
  )
}
