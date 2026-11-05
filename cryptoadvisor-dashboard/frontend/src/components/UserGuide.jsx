import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'

const TOUR_STEPS = [
  {
    id: 'welcome',
    title: 'Welcome to AssetAdvisor',
    body: 'Your AI-powered markets dashboard: track your trades and P&L, catch coins that are in play, and set alerts. This quick tour shows the key features. You can ask questions at any point using the chat box below.',
    position: 'center',
    target: null,
    context: 'The user just started the interactive guide tour of AssetAdvisor.',
  },
  {
    id: 'sidebar',
    title: 'Sidebar Navigation',
    body: 'Features are grouped into Markets, Portfolio, Tools and AI Assistant. Click a section header to collapse it, or use "Customize" to pin favorite pages and hide sections you don\'t need.',
    position: 'right',
    target: '.sidebar',
    route: '/',
    context: 'The user is looking at the sidebar navigation with four sections.',
  },
  {
    id: 'topbar',
    title: 'User Menu & Settings',
    body: 'Account settings, password, two-factor authentication, Telegram setup, data export and the audit log live in the user menu.',
    position: 'bottom-left',
    target: '.topbar-right',
    context: 'The user is looking at the top bar user menu dropdown.',
  },
  {
    id: 'dashboard-banner',
    title: 'Your Dashboard',
    body: 'A market overview plus your watchlist. Click any coin for detailed charts; star it to keep it on your watchlist.',
    position: 'bottom',
    target: '.dashboard-banner',
    context: 'The user is viewing the dashboard greeting banner.',
  },
  {
    id: 'quick-actions',
    title: 'Quick Actions',
    body: 'Jump straight to common tasks: set a price alert, log a trade, convert, read the AI market briefing, or check what is in play.',
    position: 'left',
    target: '.dashboard-quick-actions',
    context: 'The user is viewing the quick actions panel on the dashboard.',
  },
  {
    id: 'in-play',
    title: 'In-Play Coins',
    body: 'The scanner checks every pair every 15 minutes for unusual volume plus a large, decisive candle, and looks up the news behind the move. Choose your timeframe, averaging periods and thresholds, and get phone alerts.',
    position: 'center',
    target: null,
    route: '/notifications',
    context: 'The user navigated to the In-Play page with the scanner list, alert rules and phone alerts.',
  },
  {
    id: 'portfolio',
    title: 'Portfolio & Trades',
    body: 'Your portfolio is built from the trades you log. Add trades by hand on the Trades page or import them from an exchange CSV; positions and profit/loss update with live prices.',
    position: 'center',
    target: null,
    route: '/portfolio',
    context: 'The user navigated to the Portfolio page.',
  },
  {
    id: 'alerts',
    title: 'Price Alerts',
    body: 'Set price alerts, or describe one in plain words with the Smart Alert Creator. Alerts show up in your notifications and on Telegram if you connect it.',
    position: 'center',
    target: null,
    route: '/alerts',
    context: 'The user navigated to the Alerts page.',
  },
  {
    id: 'ai-suite',
    title: 'AI Assistant',
    body: 'Daily market briefings, risk reports, tax optimization, portfolio building, chart pattern recognition and a trading coach that reviews your trades. All under "AI Assistant" in the sidebar.',
    position: 'center',
    target: null,
    context: 'Overview of AI assistant features available in the sidebar.',
  },
  {
    id: 'chat',
    title: 'AI Chat Assistant',
    body: 'Click the chat button in the bottom-right corner anytime to ask about the markets, your portfolio, or how to use any feature.',
    position: 'top-left',
    target: '.chat-toggle-btn',
    context: 'The user is being shown the AI chat window toggle button.',
  },
  {
    id: 'finish',
    title: 'You\'re All Set!',
    body: 'Start by logging a trade or two, setting your In-Play rules, and starring what you want to watch. Reopen this guide anytime from the "?" button in the top bar.',
    position: 'center',
    target: null,
    route: '/',
    context: 'The tour is finishing. The user is back on the dashboard.',
  },
]

function UserGuide({ visible, onClose }) {
  const [step, setStep] = useState(0)
  const [spotlight, setSpotlight] = useState(null)
  const [tooltipPos, setTooltipPos] = useState({})
  const [question, setQuestion] = useState('')
  const [aiAnswer, setAiAnswer] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const tooltipRef = useRef(null)
  const inputRef = useRef(null)
  const navigate = useNavigate()

  const current = TOUR_STEPS[step]
  const progress = ((step + 1) / TOUR_STEPS.length) * 100

  const positionTooltip = useCallback(() => {
    if (!current) return

    if (!current.target || current.position === 'center') {
      setSpotlight(null)
      setTooltipPos({ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' })
      return
    }

    const el = document.querySelector(current.target)
    if (!el) {
      setSpotlight(null)
      setTooltipPos({ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' })
      return
    }

    const rect = el.getBoundingClientRect()
    const pad = 8
    setSpotlight({
      top: rect.top - pad,
      left: rect.left - pad,
      width: rect.width + pad * 2,
      height: rect.height + pad * 2,
    })

    const tw = 420
    const pos = current.position || 'bottom'
    let top, left, transform = 'none'

    switch (pos) {
      case 'right':
        top = rect.top + rect.height / 2
        left = rect.right + 20
        transform = 'translateY(-50%)'
        if (left + tw > window.innerWidth) {
          top = rect.bottom + 16
          left = rect.left + rect.width / 2
          transform = 'translateX(-50%)'
        }
        break
      case 'left':
        top = rect.top + rect.height / 2
        left = rect.left - tw - 20
        transform = 'translateY(-50%)'
        if (left < 0) {
          top = rect.bottom + 16
          left = rect.left + rect.width / 2
          transform = 'translateX(-50%)'
        }
        break
      case 'top':
      case 'top-left':
        top = rect.top - 280
        left = pos === 'top-left' ? rect.right - tw : rect.left + rect.width / 2
        transform = pos === 'top' ? 'translateX(-50%)' : 'none'
        if (top < 10) { top = rect.bottom + 16 }
        if (typeof left === 'number' && left < 10) left = 10
        break
      case 'bottom-left':
        top = rect.bottom + 16
        left = rect.right - tw
        if (left < 10) left = 10
        break
      case 'bottom':
      default:
        top = rect.bottom + 16
        left = rect.left + rect.width / 2
        transform = 'translateX(-50%)'
        break
    }

    if (typeof left === 'number') left = Math.max(10, Math.min(left, window.innerWidth - tw - 10))
    if (typeof top === 'number') top = Math.max(10, Math.min(top, window.innerHeight - 300))

    setTooltipPos({ top, left, transform })
  }, [current])

  useEffect(() => {
    if (!visible) return
    // Clear chat state on step change
    setAiAnswer('')
    setChatOpen(false)
    setQuestion('')

    if (current?.route) {
      navigate(current.route)
      const timer = setTimeout(positionTooltip, 400)
      return () => clearTimeout(timer)
    }
    const timer = setTimeout(positionTooltip, 150)
    return () => clearTimeout(timer)
  }, [step, visible, positionTooltip, current, navigate])

  useEffect(() => {
    if (!visible) return
    const handler = () => positionTooltip()
    window.addEventListener('resize', handler)
    window.addEventListener('scroll', handler, true)
    return () => {
      window.removeEventListener('resize', handler)
      window.removeEventListener('scroll', handler, true)
    }
  }, [visible, positionTooltip])

  // Keyboard navigation
  useEffect(() => {
    if (!visible) return
    const handler = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      if (e.key === 'ArrowRight' || e.key === 'Enter') next()
      if (e.key === 'ArrowLeft') prev()
      if (e.key === 'Escape') skip()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [visible, step])

  const next = () => {
    if (step < TOUR_STEPS.length - 1) setStep(step + 1)
    else finish()
  }

  const prev = () => {
    if (step > 0) setStep(step - 1)
  }

  const finish = () => {
    api.post('/api/settings/guide-completed', {}).catch(() => {})
    setStep(0)
    onClose()
  }

  const skip = () => {
    api.post('/api/settings/guide-completed', {}).catch(() => {})
    setStep(0)
    onClose()
  }

  const askAi = async () => {
    if (!question.trim() || aiLoading) return
    setAiLoading(true)
    setAiAnswer('')
    try {
      const contextMsg = `The user is currently on step ${step + 1} of the AssetAdvisor user guide tour. They are viewing: "${current.title}". Context: ${current.context || current.body}. Their question is: ${question}`
      const res = await api.post('/api/chat', { message: contextMsg })
      setAiAnswer(res.response || 'Sorry, I couldn\'t generate an answer right now.')
    } catch {
      setAiAnswer('Could not reach the AI assistant. Try again or use the main chat window.')
    }
    setAiLoading(false)
  }

  if (!visible || !current) return null

  const isLast = step === TOUR_STEPS.length - 1
  const isFirst = step === 0

  return (
    <div className="guide-overlay">
      {/* SVG backdrop with spotlight cutout */}
      <svg className="guide-backdrop">
        <defs>
          <mask id="guide-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {spotlight && (
              <rect
                x={spotlight.left} y={spotlight.top}
                width={spotlight.width} height={spotlight.height}
                rx="12" fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          x="0" y="0" width="100%" height="100%"
          fill="rgba(0,0,0,0.75)"
          mask="url(#guide-mask)"
        />
        {spotlight && (
          <rect
            x={spotlight.left} y={spotlight.top}
            width={spotlight.width} height={spotlight.height}
            rx="12" fill="none"
            stroke="var(--primary)" strokeWidth="2"
            className="guide-spotlight-ring"
          />
        )}
      </svg>

      {/* Tooltip */}
      <div
        ref={tooltipRef}
        className={`guide-tooltip ${current.position === 'center' ? 'guide-tooltip-center' : ''}`}
        style={{ top: tooltipPos.top, left: tooltipPos.left, transform: tooltipPos.transform || 'none' }}
      >
        {/* Progress */}
        <div className="guide-progress-bar">
          <div className="guide-progress-fill" style={{ width: `${progress}%` }} />
        </div>

        <div className="guide-step-counter">Step {step + 1} of {TOUR_STEPS.length}</div>

        <h3 className="guide-title">{current.title}</h3>
        <p className="guide-body">{current.body}</p>

        {/* Inline AI Chat */}
        <div className="guide-chat">
          <button
            className="guide-chat-toggle"
            onClick={() => { setChatOpen(!chatOpen); setTimeout(() => inputRef.current?.focus(), 100) }}
          >
            {chatOpen ? '\u2715 Close' : '\uD83D\uDCAC Ask a question'}
          </button>

          {chatOpen && (
            <div className="guide-chat-panel">
              <div className="guide-chat-input-row">
                <input
                  ref={inputRef}
                  type="text"
                  value={question}
                  onChange={e => setQuestion(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && askAi()}
                  placeholder="Ask anything about this feature..."
                  className="guide-chat-input"
                  disabled={aiLoading}
                />
                <button
                  className="guide-chat-send"
                  onClick={askAi}
                  disabled={aiLoading || !question.trim()}
                >
                  {aiLoading ? '\u23F3' : '\u2192'}
                </button>
              </div>
              {aiLoading && (
                <div className="guide-chat-answer guide-chat-loading">
                  Thinking...
                </div>
              )}
              {aiAnswer && !aiLoading && (
                <div className="guide-chat-answer">
                  {aiAnswer}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Nav buttons */}
        <div className="guide-actions">
          <button className="guide-skip" onClick={skip}>Skip tour</button>
          <div className="guide-nav-btns">
            {!isFirst && (
              <button className="guide-btn guide-btn-secondary" onClick={prev}>Back</button>
            )}
            <button className="guide-btn guide-btn-primary" onClick={next}>
              {isLast ? 'Get Started' : 'Next'}
            </button>
          </div>
        </div>

        {/* Dots */}
        <div className="guide-dots">
          {TOUR_STEPS.map((_, i) => (
            <button
              key={i}
              className={`guide-dot ${i === step ? 'active' : ''} ${i < step ? 'completed' : ''}`}
              onClick={() => setStep(i)}
              title={TOUR_STEPS[i].title}
            />
          ))}
        </div>

        {/* Keyboard hint */}
        <div className="guide-keyboard-hint">
          Use arrow keys to navigate, Esc to close
        </div>
      </div>
    </div>
  )
}

export default UserGuide
