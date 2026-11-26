/**
 * Login page.
 *
 * What: the sign-in form shown to unauthenticated users.
 * Why: every other route sits behind authentication; this is the only public page.
 * How: posts the credentials through `api.login`, stores the returned token via the
 * auth context's `login()` and navigates to the Command Center. Failures (an ApiError
 * from the client) are shown in a live `role="alert"` region.
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../App'
import { api } from '../api/client'

/** Username/password sign-in form; on success stores the session and goes to `/`. */
export default function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  /**
   * Submit handler: authenticates, saves the session and redirects; shows the error message on failure.
   * @param {React.FormEvent} e form submit event (default navigation is prevented)
   */
  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const data = await api.login(username, password)
      login(data.token, data)
      navigate('/')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>SKYWATCH</h1>
        <p className="subtitle">Bahamas Aviation, Climate & Severe Weather Network</p>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="login-user">Username</label>
            <input id="login-user" type="text" autoComplete="username" value={username} onChange={e => setUsername(e.target.value)}
              placeholder="Enter username" autoFocus required />
          </div>
          <div className="form-group">
            <label htmlFor="login-pass">Password</label>
            <input id="login-pass" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="Enter password" />
          </div>
          <button className="btn btn-primary login-btn" type="submit" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
          <p className="error-msg" role="alert">{error}</p>
        </form>
        <p style={{textAlign: 'center', marginTop: 20, fontSize: 12, color: 'var(--text-muted)'}}>
          Demo: admin / admin | meteorologist / weather
        </p>
      </div>
    </div>
  )
}
