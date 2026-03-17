import { useState, FormEvent } from 'react'
import { useNavigate, Link } from 'react-router'
import { useAuth } from '../contexts/AuthContext'
import { api, ApiError } from '../api/client'

const styles: Record<string, React.CSSProperties> = {
  container: { maxWidth: 400, margin: '80px auto', padding: '0 16px' },
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
  footer: { textAlign: 'center', marginTop: 16, fontSize: 14, color: '#666' }
}

export default function Login() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const data = await api.post<{ token: string }>('/auth/login', { email, password })
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
        <h1 style={styles.h1}>Sign in</h1>
        <p style={styles.subtitle}>Welcome back to Job Board</p>

        {error && <div style={styles.error}>{error}</div>}

        <form onSubmit={handleSubmit}>
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

          <label style={styles.label} htmlFor="password">Password</label>
          <input
            id="password"
            style={styles.input}
            type="password"
            required
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete="current-password"
          />

          <button style={styles.button} type="submit" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <p style={styles.footer}>
          Don't have an account? <Link to="/register">Register</Link>
        </p>
      </div>
    </div>
  )
}
