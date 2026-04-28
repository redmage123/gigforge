import { useNavigate } from 'react-router'
import { useAuth } from '../../auth/AuthContext'

/**
 * Compact "signed in as ... [Logout]" block for the sidebar footer.
 * Renders nothing in mock-only mode.
 */
export default function UserMenu() {
  const { user, isAuthenticated, cmsAvailable, logout } = useAuth()
  const navigate = useNavigate()

  if (!cmsAvailable) return null

  if (!isAuthenticated) {
    return (
      <div className="px-3 py-2 text-xs text-text-muted" data-testid="user-menu-anon">
        Not signed in
      </div>
    )
  }

  async function onLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="px-3 py-2" data-testid="user-menu">
      <div className="text-xs text-text-muted truncate" title={user!.email}>
        {user!.email}
      </div>
      <button
        type="button"
        onClick={onLogout}
        className="mt-1 text-xs text-accent hover:underline"
      >
        Log out
      </button>
    </div>
  )
}
