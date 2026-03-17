import { createContext, useState, useContext, useEffect, lazy, Suspense } from 'react'
import { Routes, Route, Navigate, NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { api } from './api/client'

// Auth context
export const AuthContext = createContext(null)
export function useAuth() { return useContext(AuthContext) }

// Theme context (3. Dark/Light mode)
export const ThemeContext = createContext(null)
export function useTheme() { return useContext(ThemeContext) }

// Lazy-loaded pages
const CommandCenter = lazy(() => import('./pages/CommandCenter'))
const WatchOffice = lazy(() => import('./pages/WatchOffice'))
const FlightOps = lazy(() => import('./pages/FlightOps'))
const Emissions = lazy(() => import('./pages/Emissions'))
const Emergency = lazy(() => import('./pages/Emergency'))
const SensorNetwork = lazy(() => import('./pages/SensorNetwork'))
const Training = lazy(() => import('./pages/Training'))
const AgentConsole = lazy(() => import('./pages/AgentConsole'))
const HurricaneOps = lazy(() => import('./pages/HurricaneOps'))
const MeshNetwork = lazy(() => import('./pages/MeshNetwork'))
const Simulations = lazy(() => import('./pages/Simulations'))
const Login = lazy(() => import('./pages/Login'))

const NAV_ITEMS = [
  { path: '/', icon: '🎯', label: 'Command Center' },
  { path: '/watch-office', icon: '🌤️', label: 'Watch Office' },
  { path: '/flights', icon: '✈️', label: 'Flight Operations' },
  { path: '/emissions', icon: '🌱', label: 'Carbon & Emissions' },
  { path: '/emergency', icon: '🚨', label: 'Emergency Response' },
  { path: '/sensors', icon: '📡', label: 'Sensor Network' },
  { path: '/training', icon: '🎓', label: 'Training & Certs' },
  { path: '/agents', icon: '🤖', label: 'AI Agent Console' },
  { path: '/hurricane', icon: '🌀', label: 'Hurricane Ops' },
  { path: '/mesh', icon: '🔗', label: 'Mesh Network' },
  { path: '/simulations', icon: '🧪', label: 'Simulations' },
]

// 12. Wallboard auto-cycle pages
const WALLBOARD_PAGES = ['/', '/watch-office', '/flights', '/emissions', '/sensors', '/agents']

function Layout() {
  const { user, logout } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="app-layout">
      <button className="hamburger" onClick={() => setSidebarOpen(!sidebarOpen)} aria-label="Toggle menu">
        <span /><span /><span />
      </button>
      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <h1>SKYWATCH</h1>
          <p>Bahamas Aviation & Weather</p>
        </div>
        <nav className="sidebar-nav">
          {NAV_ITEMS.map(item => (
            <NavLink key={item.path} to={item.path} end={item.path === '/'}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              onClick={() => setSidebarOpen(false)}>
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div style={{marginBottom: 8}}>{user?.first_name} {user?.last_name}</div>
          <div style={{fontSize: 11, color: 'var(--text-muted)', marginBottom: 8}}>{user?.role}</div>
          <div style={{display: 'flex', gap: 6}}>
            <button className="btn btn-sm" onClick={toggleTheme}
              style={{background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border)', flex: 1}}>
              {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
            </button>
            <button className="btn btn-sm btn-primary" onClick={logout} style={{flex: 1}}>Logout</button>
          </div>
        </div>
      </aside>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  )
}

function ProtectedRoute({ children }) {
  const { token } = useAuth()
  return token ? children : <Navigate to="/login" replace />
}

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem('token'))
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('user')) } catch { return null }
  })

  // 3. Theme state
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark')
  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    localStorage.setItem('theme', next)
  }
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  useEffect(() => {
    if (token) {
      localStorage.setItem('token', token)
      api.me().then(data => {
        if (data?.username) {
          setUser(data)
          localStorage.setItem('user', JSON.stringify(data))
        }
      }).catch(() => {})
    } else {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
    }
  }, [token])

  const login = (newToken, userData) => {
    setToken(newToken)
    setUser(userData)
    localStorage.setItem('user', JSON.stringify(userData))
  }

  const logout = () => {
    setToken(null)
    setUser(null)
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    api.logout().catch(() => {})
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      <AuthContext.Provider value={{ token, user, login, logout }}>
        <Suspense fallback={<div className="loading-spinner"><div className="spinner" /></div>}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
              <Route index element={<CommandCenter />} />
              <Route path="watch-office" element={<WatchOffice />} />
              <Route path="flights" element={<FlightOps />} />
              <Route path="emissions" element={<Emissions />} />
              <Route path="emergency" element={<Emergency />} />
              <Route path="sensors" element={<SensorNetwork />} />
              <Route path="training" element={<Training />} />
              <Route path="agents" element={<AgentConsole />} />
              <Route path="hurricane" element={<HurricaneOps />} />
              <Route path="mesh" element={<MeshNetwork />} />
              <Route path="simulations" element={<Simulations />} />
            </Route>
          </Routes>
        </Suspense>
      </AuthContext.Provider>
    </ThemeContext.Provider>
  )
}
