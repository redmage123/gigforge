import { useState, useEffect } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../contexts/AuthContext'
import { api, ApiError } from '../api/client'
import type { Application } from '../types'

const statusColors: Record<string, { bg: string; color: string }> = {
  pending:   { bg: '#fff8e1', color: '#8d6e00' },
  reviewing: { bg: '#e3f2fd', color: '#1565c0' },
  accepted:  { bg: '#e6f4ea', color: '#2d6a4f' },
  rejected:  { bg: '#fce4ec', color: '#b71c1c' }
}

const styles: Record<string, React.CSSProperties> = {
  container: { maxWidth: 760, margin: '0 auto', padding: '24px 16px' },
  h1: { margin: '0 0 8px', fontSize: 26, fontWeight: 700 },
  subtitle: { color: '#666', marginBottom: 28 },
  card: {
    background: '#fff',
    border: '1px solid #e0e0e0',
    borderRadius: 10,
    padding: '20px 24px',
    marginBottom: 14,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
  },
  jobTitle: { margin: '0 0 4px', fontSize: 17, fontWeight: 600 },
  meta: { color: '#666', fontSize: 13, margin: '0 0 8px' },
  date: { color: '#888', fontSize: 13 },
  status: (s: string): React.CSSProperties => ({
    display: 'inline-block',
    padding: '3px 12px',
    borderRadius: 20,
    fontSize: 13,
    fontWeight: 600,
    textTransform: 'capitalize',
    ...statusColors[s]
  }),
  link: { color: '#3b5bdb', fontSize: 13, textDecoration: 'none' },
  loading: { textAlign: 'center', padding: 40, color: '#666' },
  empty: { textAlign: 'center', padding: 60, color: '#888' },
  error: {
    background: '#fff0f0',
    border: '1px solid #ffcdd2',
    color: '#c62828',
    padding: 12,
    borderRadius: 6
  }
}

export default function MyApplications() {
  const { token } = useAuth()
  const [applications, setApplications] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.get<{ applications: Application[] }>('/applications/mine', token)
      .then(data => { setApplications(data.applications); setLoading(false) })
      .catch(err => {
        setError(err instanceof ApiError ? err.message : 'Failed to load applications')
        setLoading(false)
      })
  }, [token])

  if (loading) return <div style={styles.loading}>Loading your applications...</div>

  return (
    <div style={styles.container}>
      <h1 style={styles.h1}>My Applications</h1>
      <p style={styles.subtitle}>{applications.length} application{applications.length !== 1 ? 's' : ''}</p>

      {error && <div style={styles.error}>{error}</div>}

      {applications.length === 0 && !error ? (
        <div style={styles.empty}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>&#128203;</div>
          <div>You haven't applied to any jobs yet.</div>
          <div style={{ marginTop: 12 }}>
            <Link to="/jobs" style={styles.link}>Browse open positions</Link>
          </div>
        </div>
      ) : (
        applications.map(app => {
          const applied = new Date(app.created_at).toLocaleDateString('en-GB', {
            day: 'numeric', month: 'short', year: 'numeric'
          })
          return (
            <div key={app.id} style={styles.card}>
              <div>
                <h3 style={styles.jobTitle}>
                  <Link to={`/jobs/${app.job_id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                    {app.job_title}
                  </Link>
                </h3>
                <p style={styles.meta}>
                  {app.location && <span>{app.location} &bull; </span>}
                  {app.job_type && <span>{app.job_type}</span>}
                </p>
                <p style={styles.date}>Applied {applied}</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={styles.status(app.status)}>{app.status}</span>
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}
