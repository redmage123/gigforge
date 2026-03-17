import { Routes, Route, Link, useNavigate } from 'react-router'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import Login from './pages/Login'
import Register from './pages/Register'
import Jobs from './pages/Jobs'
import JobDetail from './pages/JobDetail'
import PostJob from './pages/PostJob'
import MyApplications from './pages/MyApplications'
import Admin from './pages/Admin'

const navStyles: Record<string, React.CSSProperties> = {
  nav: {
    background: '#fff',
    borderBottom: '1px solid #e0e0e0',
    padding: '0 24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 56,
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
    position: 'sticky',
    top: 0,
    zIndex: 100
  },
  logo: { fontWeight: 800, fontSize: 20, color: '#3b5bdb', textDecoration: 'none' },
  links: { display: 'flex', gap: 4, alignItems: 'center' },
  link: {
    color: '#444',
    textDecoration: 'none',
    padding: '6px 12px',
    borderRadius: 6,
    fontSize: 14,
    fontWeight: 500
  },
  primaryLink: {
    background: '#3b5bdb',
    color: '#fff',
    textDecoration: 'none',
    padding: '6px 14px',
    borderRadius: 6,
    fontSize: 14,
    fontWeight: 500,
    marginLeft: 4
  },
  logoutBtn: {
    background: 'none',
    border: '1px solid #ccc',
    color: '#555',
    padding: '5px 12px',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 14,
    marginLeft: 4
  },
  userInfo: { fontSize: 13, color: '#666', marginRight: 4 }
}

function NavBar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/login')
  }

  return (
    <nav style={navStyles.nav}>
      <Link to="/jobs" style={navStyles.logo}>JobBoard</Link>
      <div style={navStyles.links}>
        <Link to="/jobs" style={navStyles.link}>Browse Jobs</Link>
        {user ? (
          <>
            {user.role === 'applicant' && (
              <Link to="/applications/mine" style={navStyles.link}>My Applications</Link>
            )}
            {(user.role === 'employer' || user.role === 'admin') && (
              <Link to="/jobs/post" style={navStyles.link}>Post a Job</Link>
            )}
            {user.role === 'admin' && (
              <Link to="/admin" style={navStyles.link}>Admin</Link>
            )}
            <span style={navStyles.userInfo}>{user.email}</span>
            <button style={navStyles.logoutBtn} onClick={handleLogout}>Sign out</button>
          </>
        ) : (
          <>
            <Link to="/login" style={navStyles.link}>Sign in</Link>
            <Link to="/register" style={navStyles.primaryLink}>Register</Link>
          </>
        )}
      </div>
    </nav>
  )
}

function AppRoutes() {
  return (
    <>
      <NavBar />
      <main style={{ minHeight: 'calc(100vh - 56px)' }}>
        <Routes>
          <Route path="/" element={<Jobs />} />
          <Route path="/jobs" element={<Jobs />} />
          <Route path="/jobs/:id" element={<JobDetail />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route
            path="/jobs/post"
            element={
              <ProtectedRoute roles={['employer', 'admin']}>
                <PostJob />
              </ProtectedRoute>
            }
          />
          <Route
            path="/applications/mine"
            element={
              <ProtectedRoute roles={['applicant']}>
                <MyApplications />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <ProtectedRoute roles={['admin']}>
                <Admin />
              </ProtectedRoute>
            }
          />
        </Routes>
      </main>
    </>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  )
}
