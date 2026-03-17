import { useState, FormEvent } from 'react'
import { useNavigate, Link } from 'react-router'
import { useAuth } from '../contexts/AuthContext'
import { api, ApiError } from '../api/client'
import type { Role } from '../types'

const styles: Record<string, React.CSSProperties> = {
  container: { maxWidth: 440, margin: '60px auto', padding: '0 16px' },
  card: {
    background: '#fff',
    border: '1px solid #e0e0e0',
    borderRadius: 12,
    padding: 32,
    boxShadow: '0 4px 12px rgba(0,0,0,0.08)'
  },
  h1: { margin: '0 0 8px', fontSize: 24, fontWeight: 700 },
  subtitle: { margin: '0 0 24px', color: '#666', fontSize: 14 },
  label: { display: 'block', marginBottom: 4, fontWeight: 500, fontSize: 14 },
  input: {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #ccc',
    borderRadius: 6,
    fontSize: 15,
    marginBottom: 16,
    outline: 'none'
  },
  select: {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #ccc',
    borderRadius: 6,
    fontSize: 15,
    marginBottom: 16,
    background: '#fff',
    cursor: 'pointer'
  },
  button: {
    width: '100%',
    background: '#3b5bdb',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    padding: '12px',
    fontSize: 16,
    fontWeight: 600,
    cursor: 'pointer'
  },
  error: {
    background: '#fff0f0',
    border: '1px solid #ffcdd2',
    color: '#c62828',
    padding: '10px 14px',
    borderRadius: 6,
    marginBottom: 16,
    fontSize: 14
  },
  roleGroup: {
    display: 'flex',
    gap: 12,
    marginBottom: 20
  },
  roleCard: (selected: boolean): React.CSSProperties => ({
    flex: 1,
    padding: '12px 8px',
    border: `2px solid ${selected ? '#3b5bdb' : '#e0e0e0'}`,
    borderRadius: 8,
    cursor: 'pointer',
    textAlign: 'center',
    background: selected ? '#f0f4ff' : '#fff',
    transition: 'all 0.2s'
  }),
  roleLabel: { fontWeight: 600, fontSize: 14, marginBottom: 2 },
  roleDesc: { fontSize: 12, color: '#666' },
  footer: { textAlign: 'center', marginTop: 16, fontSize: 14, color: '#666' }
}

export default function Register() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<Role>('applicant')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const data = await api.post<{ token: string }>('/auth/register', { email, password, name, role })
      login(data.token)
      navigate('/jobs')
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError('An unexpected error occurred')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.h1}>Create account</h1>
        <p style={styles.subtitle}>Join Job Board today</p>

        {error && <div style={styles.error}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <label style={styles.label}>I am a...</label>
          <div style={styles.roleGroup}>
            {(['applicant', 'employer'] as Role[]).map(r => (
              <div
                key={r}
                style={styles.roleCard(role === r)}
                onClick={() => setRole(r)}
                role="button"
                tabIndex={0}
                onKeyDown={e => e.key === 'Enter' && setRole(r)}
              >
                <div style={styles.roleLabel}>{r === 'applicant' ? 'Job Seeker' : 'Employer'}</div>
                <div style={styles.roleDesc}>
                  {r === 'applicant' ? 'Find & apply for jobs' : 'Post jobs & hire'}
                </div>
              </div>
            ))}
          </div>

          <label style={styles.label} htmlFor="name">Full name</label>
          <input
            id="name"
            style={styles.input}
            type="text"
            required
            value={name}
            onChange={e => setName(e.target.value)}
            autoComplete="name"
          />

          <label style={styles.label} htmlFor="email">Email address</label>
          <input
            id="email"
            style={styles.input}
            type="email"
            required
            value={email}
            onChange={e => setEmail(e.target.value)}
            autoComplete="email"
          />

          <label style={styles.label} htmlFor="password">Password (min 6 characters)</label>
          <input
            id="password"
            style={styles.input}
            type="password"
            required
            minLength={6}
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete="new-password"
          />

          <button style={styles.button} type="submit" disabled={loading}>
            {loading ? 'Creating account...' : 'Create account'}
          </button>
        </form>

        <p style={styles.footer}>
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  )
}
