import { createContext, useState, useContext, useEffect, useCallback, lazy, Suspense } from 'react'
import { Routes, Route, Navigate, NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { api } from './api/client'
import { useDemoPause, useDemoPauseSync, setDemoPaused } from './hooks/useDemoPause'
import { storyById, STORY_EVENT } from './tour/stories'

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
const CarbonOversight = lazy(() => import('./pages/CarbonOversight'))
const Emergency = lazy(() => import('./pages/Emergency'))
const SensorNetwork = lazy(() => import('./pages/SensorNetwork'))
const Training = lazy(() => import('./pages/Training'))
const AgentConsole = lazy(() => import('./pages/AgentConsole'))
const HurricaneOps = lazy(() => import('./pages/HurricaneOps'))
const MeshNetwork = lazy(() => import('./pages/MeshNetwork'))
const MeshGuide = lazy(() => import('./pages/MeshGuide'))
const Simulations = lazy(() => import('./pages/Simulations'))
const Verification = lazy(() => import('./pages/Verification'))
const Login = lazy(() => import('./pages/Login'))
const GuidedTour = lazy(() => import('./components/tour/GuidedTour'))

const NAV_ITEMS = [
  { path: '/', icon: '🎯', label: 'Command Center' },
  { path: '/watch-office', icon: '🌤️', label: 'Watch Office' },
  { path: '/verification', icon: '📈', label: 'Forecast Skill' },
  { path: '/flights', icon: '✈️', label: 'Flight Operations' },
  { path: '/emissions', icon: '🌱', label: 'Carbon & Emissions' },
  { path: '/corsia-oversight', icon: '📒', label: 'CORSIA Oversight' },
  { path: '/emergency', icon: '🚨', label: 'Emergency Response' },
  { path: '/sensors', icon: '📡', label: 'Sensor Network' },
  { path: '/training', icon: '🎓', label: 'Training & Certs' },
  { path: '/agents', icon: '🤖', label: 'AI Agent Console' },
  { path: '/hurricane', icon: '🌀', label: 'Hurricane Ops' },
  { path: '/mesh', icon: '🔗', label: 'Mesh Network' },
  { path: '/mesh-guide', icon: '📖', label: 'Station & Model Guide' },
  { path: '/simulations', icon: '🧪', label: 'Simulations' },
]

// 12. Wallboard auto-cycle pages
const WALLBOARD_PAGES = ['/', '/watch-office', '/flights', '/emissions', '/sensors', '/agents']

function Layout() {
  const { user, logout } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [tourOpen, setTourOpen] = useState(() => new URLSearchParams(window.location.search).has('tour'))
  // A guided story (tour/stories.js): started from a "Play story" button or a ?story=<id> link.
  const [story, setStory] = useState(() => storyById(new URLSearchParams(window.location.search).get('story') || ''))
  useEffect(() => {
    const play = (e) => { const s = storyById(e.detail?.id); if (s) { setTourOpen(false); setStory(s) } }
    window.addEventListener(STORY_EVENT, play)
    return () => window.removeEventListener(STORY_EVENT, play)
  }, [])
  const endStory = useCallback(() => { api.meshStoryEnd().catch(() => {}) }, [])
  const pause = useDemoPause()
  const [pauseError, setPauseError] = useState('')
  useDemoPauseSync(true)
  const pausedAt = pause.since ? new Date(pause.since).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) : ''
  const pausedBy = pause.by ? ` (paused by ${pause.by}${pausedAt ? ' at ' + pausedAt : ''})` : ''
  const togglePause = async () => {
    setPauseError('')
    try { await setDemoPaused(!pause.paused) } catch { setPauseError('Could not change the pause. Check the connection and try again.') }
  }

  return (
    <div className="app-layout">
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <button className="hamburger" onClick={() => setSidebarOpen(!sidebarOpen)}
        aria-label={sidebarOpen ? 'Close menu' : 'Open menu'} aria-expanded={sidebarOpen} aria-controls="app-sidebar">
        <span /><span /><span />
      </button>
      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}
      <aside id="app-sidebar" className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <h1>SKYWATCH</h1>
          <p>Bahamas Aviation & Weather</p>
          <button type="button" className="btn btn-sm btn-primary tour-start" aria-pressed={tourOpen}
            onClick={() => { setStory(null); setTourOpen(true); setSidebarOpen(false) }}>
            <span aria-hidden="true">▶ </span>{tourOpen ? 'Demo running' : 'Guided demo'}
          </button>
          <button type="button" className={`btn btn-sm demo-pause-btn ${pause.paused ? 'is-paused' : ''}`}
            aria-pressed={pause.paused} onClick={togglePause}
            title="Freeze every screen and the simulations, for all viewers, until resumed">
            <span aria-hidden="true">{pause.paused ? '▶ ' : '❚❚ '}</span>{pause.paused ? 'Resume demo' : 'Pause demo'}
          </button>
        </div>
        <nav className="sidebar-nav" aria-label="Main">
          {NAV_ITEMS.map(item => (
            <NavLink key={item.path} to={item.path} end={item.path === '/'}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              onClick={() => setSidebarOpen(false)}>
              <span className="nav-icon" aria-hidden="true">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div style={{marginBottom: 8}}>{user?.first_name} {user?.last_name}</div>
          <div style={{fontSize: 11, color: 'var(--text-muted)', marginBottom: 8}}>{user?.role}</div>
          <div style={{display: 'flex', gap: 6}}>
            <button className="btn btn-sm" onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              style={{background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border)', flex: 1}}>
              <span aria-hidden="true">{theme === 'dark' ? '☀️' : '🌙'}</span> {theme === 'dark' ? 'Light' : 'Dark'}
            </button>
            <button className="btn btn-sm btn-primary" onClick={logout} style={{flex: 1}}>Logout</button>
          </div>
        </div>
      </aside>
      <main className="main-content" id="main-content" tabIndex={-1}>
        <div role="status" aria-live="polite" className="demo-pause-live">
          {pause.paused && (
            <div className="demo-pause-banner">
              <span className="demo-pause-icon" aria-hidden="true">❚❚</span>
              <span>
                <b>Demo paused.</b> Screens, alerts and simulations are frozen for everyone{pausedBy}.
              </span>
              <button type="button" className="btn btn-sm btn-primary" onClick={togglePause}>Resume</button>
            </div>
          )}
          {pauseError && <div className="demo-pause-banner is-error">{pauseError}</div>}
        </div>
        <Outlet />
      </main>
      {tourOpen && (
        <Suspense fallback={null}>
          <GuidedTour key="tour" open={tourOpen} onClose={() => setTourOpen(false)} />
        </Suspense>
      )}
      {story && !tourOpen && (
        <Suspense fallback={null}>
          <GuidedTour key={`story-${story.id}`} open steps={story.steps} label={`Story: ${story.title}`}
            onEnd={endStory} storyId={story.id} onClose={() => setStory(null)} />
        </Suspense>
      )}
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
              <Route path="corsia-oversight" element={<CarbonOversight />} />
              <Route path="emergency" element={<Emergency />} />
              <Route path="sensors" element={<SensorNetwork />} />
              <Route path="training" element={<Training />} />
              <Route path="agents" element={<AgentConsole />} />
              <Route path="hurricane" element={<HurricaneOps />} />
              <Route path="mesh" element={<MeshNetwork />} />
              <Route path="mesh-guide" element={<MeshGuide />} />
              <Route path="simulations" element={<Simulations />} />
              <Route path="verification" element={<Verification />} />
            </Route>
          </Routes>
        </Suspense>
      </AuthContext.Provider>
    </ThemeContext.Provider>
  )
}
