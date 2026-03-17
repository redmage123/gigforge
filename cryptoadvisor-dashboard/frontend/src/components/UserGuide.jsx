import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'

const TOUR_STEPS = [
  {
    id: 'welcome',
    title: 'Welcome to CryptoAdvisor',
    body: 'Your personal AI-powered cryptocurrency dashboard. This quick tour will walk you through the key features. You can ask questions at any point using the chat box below.',
    position: 'center',
    target: null,
    context: 'The user just started the interactive guide tour of CryptoAdvisor dashboard.',
  },
  {
    id: 'sidebar',
    title: 'Sidebar Navigation',
    body: 'All features are organized into sections: Markets, Portfolio, DeFi, Tools, Security, AI Assistant, and more. Click section headers to collapse them, or hit "Customize" to pin favorites and hide sections you don\'t need.',
    position: 'right',
    target: '.sidebar',
    route: '/',
    context: 'The user is looking at the sidebar navigation with 9 sections and 50+ pages.',
  },
  {
    id: 'topbar',
    title: 'User Menu & Settings',
    body: 'Access account settings, password, API keys, Telegram setup, data import/export, audit log, and more from the user menu.',
    position: 'bottom-left',
    target: '.topbar-right',
    context: 'The user is looking at the top bar user menu dropdown.',
  },
  {
    id: 'dashboard-banner',
    title: 'Personalized Dashboard',
    body: 'Your dashboard greets you by name and summarizes your alerts and watched coins. The market overview cards show real-time global stats — total market cap, 24h volume, BTC dominance, and active coins.',
    position: 'bottom',
    target: '.dashboard-banner',
    context: 'The user is viewing the personalized dashboard greeting banner.',
  },
  {
    id: 'dashboard-coins',
    title: 'Coin Cards & Watchlist',
    body: 'Click any coin to see detailed candlestick charts, price/volume overlays, and volatility analysis across 6 time periods (1D to 1Y). Star coins to add them to your personal watchlist at the top.',
    position: 'top',
    target: '.coin-grid',
    context: 'The user is viewing the top coins grid and watchlist feature.',
  },
  {
    id: 'quick-actions',
    title: 'Quick Actions',
    body: 'Jump to common tasks — set price alerts, log trades, convert currencies, get an AI market briefing, manage wallets, or check gas fees. All one click away.',
    position: 'left',
    target: '.dashboard-quick-actions',
    context: 'The user is viewing the quick actions panel on the dashboard.',
  },
  {
    id: 'sentiment-intro',
    title: 'AI Sentiment Advisor',
    body: 'The AI scans news from CoinDesk, CoinTelegraph, Reddit, CryptoPanic, and 6+ RSS feeds every 15 minutes. It uses NLP to score sentiment and generates personalized buy/hold/sell recommendations based on YOUR investment profile.',
    position: 'center',
    target: null,
    route: '/sentiment',
    context: 'The user navigated to the AI Sentiment Advisor page. This page has tabs: Recommendations, News Feed, Alerts, and Your Strategy.',
  },
  {
    id: 'sentiment-profile',
    title: 'Your Investment Profile',
    body: 'Click "Your Strategy" to configure your risk tolerance (Conservative to Degen), strategy (HODL, DCA, Swing, Active, Income), time horizon, portfolio goals, and preferred coins. Every recommendation adapts to YOUR approach.',
    position: 'bottom',
    target: '.period-btn',
    context: 'The user is being shown the strategy/profile tab of the sentiment advisor.',
  },
  {
    id: 'sentiment-recs',
    title: 'Smart Recommendations',
    body: 'Each coin gets a recommendation based on 6 weighted signals: news sentiment, price trend, volatility, Fear & Greed, volume, and goal alignment. A personalized rationale explains WHY each action was recommended for you specifically.',
    position: 'bottom',
    target: '.card',
    context: 'The user is viewing the AI-generated buy/hold/sell recommendation cards.',
  },
  {
    id: 'wallet-connect',
    title: 'Connect Your Wallet',
    body: 'Link your crypto wallets in seconds. Use WalletConnect to scan a QR code with 300+ mobile wallets (Trust, Rainbow, Zerion, etc.), connect MetaMask directly from your browser, or paste any address manually. Supports Ethereum, Polygon, BSC, Arbitrum, Optimism, Avalanche, Base, Solana, and Bitcoin.',
    position: 'center',
    target: null,
    route: '/wallet',
    context: 'The user navigated to the Wallet Management page which has WalletConnect, MetaMask, and manual address entry options.',
  },
  {
    id: 'portfolio',
    title: 'Portfolio & Wallet Tracking',
    body: 'Once wallets are connected, track holdings across all of them with allocation breakdowns and P&L history. View on-chain P&L, and backtest strategies against historical data.',
    position: 'center',
    target: null,
    route: '/portfolio',
    context: 'The user navigated to the Portfolio page.',
  },
  {
    id: 'alerts',
    title: 'Price & Sentiment Alerts',
    body: 'Set price alerts on any coin — monitored 24/7. The AI also auto-generates sentiment shift alerts when news sentiment swings 25+ points for your tracked coins. Get notified via the dashboard or Telegram.',
    position: 'center',
    target: null,
    route: '/alerts',
    context: 'The user navigated to the Alerts page.',
  },
  {
    id: 'tools-overview',
    title: 'Powerful Tools Suite',
    body: 'CryptoAdvisor packs 50+ tools: DCA calculator & auto-plans, tax reporting, whale tracking, copy trading, gas tracker, token approvals, airdrop finder, rug pull detector, backtesting, yield finder, governance voting, mempool monitoring, and more.',
    position: 'center',
    target: null,
    context: 'Overview of all available tools in the dashboard.',
  },
  {
    id: 'ai-suite',
    title: 'AI-Powered Features',
    body: 'Beyond sentiment analysis: AI market briefings, risk reports, tax optimization, portfolio building suggestions, chart pattern recognition, regulatory monitoring, and a personal trading coach. All under "AI Assistant" in the sidebar.',
    position: 'center',
    target: null,
    context: 'Overview of AI assistant features available in the sidebar.',
  },
  {
    id: 'customization',
    title: 'Make It Yours',
    body: 'Pin favorite pages, hide unused sections, configure your investment profile, set alert preferences, and customize dashboard widgets. The more you personalize, the smarter your recommendations become.',
    position: 'center',
    target: null,
    context: 'Explaining customization features: sidebar pinning, hiding, widget layout, investment profile.',
  },
  {
    id: 'chat',
    title: 'AI Chat Assistant',
    body: 'Click the chat button in the bottom-right corner anytime to ask the AI questions about crypto, your portfolio, market conditions, or how to use any feature. It has full context of your data.',
    position: 'top-left',
    target: '.chat-toggle',
    context: 'The user is being shown the AI chat window toggle button.',
  },
  {
    id: 'finish',
    title: 'You\'re All Set!',
    body: 'Start by exploring the dashboard, setting up your investment profile in the Sentiment Advisor, and starring coins to watch. Reopen this guide anytime from the "?" button in the top bar. Happy trading!',
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
      const contextMsg = `The user is currently on step ${step + 1} of the CryptoAdvisor user guide tour. They are viewing: "${current.title}". Context: ${current.context || current.body}. Their question is: ${question}`
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
