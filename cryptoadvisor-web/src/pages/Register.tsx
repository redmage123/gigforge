import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { useAuth } from '../auth/AuthContext'
import { AuthError } from '../auth/api'
import Panel from '../components/ui/Panel'

const MIN_PASSWORD = 8

export default function Register() {
  const { register, cmsAvailable } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  if (!cmsAvailable) {
    return (
      <Panel title="Register">
        <p className="text-text-muted text-sm">
          Registration is unavailable in mock-only mode. Set <code>VITE_CMS_URL</code> at build time.
        </p>
      </Panel>
    )
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < MIN_PASSWORD) {
      setError(`Password must be at least ${MIN_PASSWORD} characters`)
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }
    setPending(true)
    try {
      await register({ email, password })
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof AuthError ? err.message : 'Registration failed')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="max-w-md mx-auto" data-testid="register-page">
      <Panel title="Create account">
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="block text-xs uppercase tracking-wide text-text-muted mb-1" htmlFor="register-email">
              Email
            </label>
            <input
              id="register-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 rounded bg-bg-elevated border border-bg-border text-text-primary"
            />
          </div>

          <div>
            <label className="block text-xs uppercase tracking-wide text-text-muted mb-1" htmlFor="register-password">
              Password (min {MIN_PASSWORD})
            </label>
            <input
              id="register-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={MIN_PASSWORD}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 rounded bg-bg-elevated border border-bg-border text-text-primary"
            />
          </div>

          <div>
            <label className="block text-xs uppercase tracking-wide text-text-muted mb-1" htmlFor="register-confirm">
              Confirm password
            </label>
            <input
              id="register-confirm"
              type="password"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full px-3 py-2 rounded bg-bg-elevated border border-bg-border text-text-primary"
            />
          </div>

          {error && (
            <div className="text-sm text-rose-400" role="alert" data-testid="register-error">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={pending}
            className="w-full py-2 rounded bg-accent text-white font-semibold disabled:opacity-50"
          >
            {pending ? 'Creating…' : 'Create account'}
          </button>

          <p className="text-sm text-text-muted text-center pt-2">
            Already have an account?{' '}
            <Link to="/login" className="text-accent hover:underline">
              Sign in
            </Link>
          </p>
        </form>
      </Panel>
    </div>
  )
}
