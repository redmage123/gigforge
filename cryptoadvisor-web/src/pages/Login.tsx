import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useAuth } from '../auth/AuthContext'
import { AuthError } from '../auth/api'
import Panel from '../components/ui/Panel'

export default function Login() {
  const { login, cmsAvailable } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const returnTo = params.get('returnTo') ?? '/'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  if (!cmsAvailable) {
    return (
      <Panel title="Sign in">
        <p className="text-text-muted text-sm">
          Login is unavailable in mock-only mode. Set <code>VITE_CMS_URL</code> at build time.
        </p>
      </Panel>
    )
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setPending(true)
    try {
      await login({ email, password })
      navigate(returnTo, { replace: true })
    } catch (err) {
      setError(err instanceof AuthError ? err.message : 'Login failed')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="max-w-md mx-auto" data-testid="login-page">
      <Panel title="Sign in">
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="block text-xs uppercase tracking-wide text-text-muted mb-1" htmlFor="login-email">
              Email
            </label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 rounded bg-bg-elevated border border-bg-border text-text-primary"
            />
          </div>

          <div>
            <label className="block text-xs uppercase tracking-wide text-text-muted mb-1" htmlFor="login-password">
              Password
            </label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 rounded bg-bg-elevated border border-bg-border text-text-primary"
            />
          </div>

          {error && (
            <div className="text-sm text-rose-400" role="alert" data-testid="login-error">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={pending}
            className="w-full py-2 rounded bg-accent text-white font-semibold disabled:opacity-50"
          >
            {pending ? 'Signing in…' : 'Sign in'}
          </button>

          <p className="text-sm text-text-muted text-center pt-2">
            No account?{' '}
            <Link to="/register" className="text-accent hover:underline">
              Register
            </Link>
          </p>
        </form>
      </Panel>
    </div>
  )
}
