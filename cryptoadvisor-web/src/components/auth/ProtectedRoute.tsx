import { Navigate, useLocation } from 'react-router'
import { useAuth } from '../../auth/AuthContext'

interface Props {
  children: React.ReactNode
}

/**
 * Wraps any element that requires an authenticated user.
 *
 * - In mock-only mode (no CMS), passes through (auth is opt-in).
 * - While the initial /me request is in flight, renders a placeholder.
 * - When unauthenticated, redirects to /login with returnTo set to the
 *   current path so the user lands back where they were after sign-in.
 */
export default function ProtectedRoute({ children }: Props) {
  const { user, isLoading, cmsAvailable } = useAuth()
  const location = useLocation()

  if (!cmsAvailable) return <>{children}</>

  if (isLoading) {
    return (
      <div className="text-text-muted text-sm py-12 text-center" data-testid="auth-loading">
        Loading session…
      </div>
    )
  }

  if (!user) {
    const returnTo = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/login?returnTo=${returnTo}`} replace />
  }

  return <>{children}</>
}
