import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../App'

function TopBar({ onStartGuide }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const menuRef = useRef(null)

  const username = user?.username || user?.sub || 'User'
  const fullName = [user?.first_name, user?.last_name].filter(Boolean).join(' ') || username

  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const go = (path) => {
    setOpen(false)
    navigate(path)
  }

  const handleLogout = () => {
    setOpen(false)
    logout()
    navigate('/login')
  }

  return (
    <header className="topbar">
      <div className="topbar-left">
        <h1 className="topbar-title">CryptoAdvisor</h1>
      </div>
      <div className="topbar-right" ref={menuRef}>
        <button
          className="guide-help-btn"
          onClick={onStartGuide}
          title="Open interactive guide"
        >
          ?
        </button>
        <button className="user-menu-btn" onClick={() => setOpen(!open)}>
          <span className="user-avatar">{(user?.first_name || username).charAt(0).toUpperCase()}</span>
          <span className="user-name">{fullName}</span>
          <span className={`user-chevron ${open ? 'open' : ''}`}>&#9662;</span>
        </button>

        {open && (
          <div className="user-dropdown">
            <div className="dropdown-header">
              <span className="dropdown-avatar">{(user?.first_name || username).charAt(0).toUpperCase()}</span>
              <div>
                <div className="dropdown-username">{fullName}</div>
                <div className="dropdown-role">{user?.role || 'user'}</div>
              </div>
            </div>
            <div className="dropdown-divider" />

            <div className="dropdown-section-label">Account</div>
            <button className="dropdown-item" onClick={() => go('/settings')}>
              <span className="dropdown-icon">&#9881;</span> Settings
            </button>
            <button className="dropdown-item" onClick={() => go('/change-password')}>
              <span className="dropdown-icon">&#128274;</span> Change Password
            </button>
            <button className="dropdown-item" onClick={() => go('/api-keys')}>
              <span className="dropdown-icon">&#128273;</span> API Keys
            </button>
            <button className="dropdown-item" onClick={() => go('/sessions')}>
              <span className="dropdown-icon">&#128187;</span> Active Sessions
            </button>

            <div className="dropdown-divider" />
            <div className="dropdown-section-label">Data</div>
            <button className="dropdown-item" onClick={() => go('/telegram-setup')}>
              <span className="dropdown-icon">&#9993;</span> Telegram Setup
            </button>
            <button className="dropdown-item" onClick={() => go('/csv-import')}>
              <span className="dropdown-icon">&#128196;</span> CSV Import
            </button>
            <button className="dropdown-item" onClick={() => go('/data-export')}>
              <span className="dropdown-icon">&#128229;</span> Data Export
            </button>
            <button className="dropdown-item" onClick={() => go('/memory')}>
              <span className="dropdown-icon">&#129504;</span> AI Memory
            </button>

            <div className="dropdown-divider" />
            <div className="dropdown-section-label">Admin</div>
            <button className="dropdown-item" onClick={() => go('/audit-log')}>
              <span className="dropdown-icon">&#128220;</span> Audit Log
            </button>
            <button className="dropdown-item" onClick={() => go('/setup-wizard')}>
              <span className="dropdown-icon">&#127919;</span> Setup Wizard
            </button>
            <button className="dropdown-item" onClick={() => { setOpen(false); onStartGuide?.() }}>
              <span className="dropdown-icon">&#10068;</span> Interactive Guide
            </button>

            <div className="dropdown-divider" />
            <button className="dropdown-item dropdown-logout" onClick={handleLogout}>
              <span className="dropdown-icon">&#9211;</span> Logout
            </button>
          </div>
        )}
      </div>
    </header>
  )
}

export default TopBar
