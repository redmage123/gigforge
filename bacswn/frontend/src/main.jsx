/**
 * Browser entry point.
 *
 * What: mounts the React app into #root inside a BrowserRouter.
 * Why: keeps bootstrapping (router, global CSS) out of App so App stays testable.
 * How: React 18 createRoot; index.css holds the global theme tokens and layout.
 */
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
)
