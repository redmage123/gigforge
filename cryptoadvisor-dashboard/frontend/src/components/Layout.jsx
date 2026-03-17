import { useState, useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import ChatWindow from './ChatWindow'
import UserGuide from './UserGuide'
import { api } from '../api/client'

function Layout() {
  const [guideVisible, setGuideVisible] = useState(false)

  // Check if user has completed the guide on mount
  useEffect(() => {
    api.get('/api/settings/guide-status').then(res => {
      if (res && !res.guide_completed) {
        // Small delay so the page renders first
        setTimeout(() => setGuideVisible(true), 800)
      }
    }).catch(() => {})
  }, [])

  return (
    <div className="layout">
      <Sidebar />
      <div className="main-area">
        <TopBar onStartGuide={() => setGuideVisible(true)} />
        <main className="content">
          <Outlet />
        </main>
      </div>
      <ChatWindow />
      <UserGuide visible={guideVisible} onClose={() => setGuideVisible(false)} />
    </div>
  )
}

export default Layout
