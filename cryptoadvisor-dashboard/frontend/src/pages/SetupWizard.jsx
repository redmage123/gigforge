import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../App'
import { api } from '../api/client'
import PasswordInput from '../components/PasswordInput'

const STEPS = [
  { key: 'welcome', label: 'Welcome' },
  { key: 'interests', label: 'Interests' },
  { key: 'api_keys', label: 'API Keys' },
  { key: 'wallet', label: 'Wallet' },
  { key: 'alerts', label: 'Alerts' },
  { key: 'portfolio', label: 'Portfolio' },
  { key: 'complete', label: 'Complete' },
]

const INTEREST_OPTIONS = [
  { id: 'portfolio', label: 'Portfolio Tracking', icon: '\ud83d\udcca' },
  { id: 'defi', label: 'DeFi / Yield', icon: '\ud83c\udf3e' },
  { id: 'trading', label: 'Trading', icon: '\ud83d\udcc8' },
  { id: 'nfts', label: 'NFTs', icon: '\ud83d\uddbc' },
  { id: 'tax', label: 'Tax Planning', icon: '\ud83d\udccb' },
  { id: 'analysis', label: 'Market Analysis', icon: '\ud83d\udd0d' },
  { id: 'whales', label: 'Whale Watching', icon: '\ud83d\udc0b' },
]

const EXPERIENCE_LEVELS = ['Beginner', 'Intermediate', 'Advanced']
const RISK_LEVELS = ['Conservative', 'Moderate', 'Aggressive']

// Key integrations shown in the wizard (subset of full list)
const WIZARD_INTEGRATIONS = [
  {
    id: 'anthropic',
    name: 'Anthropic (Claude)',
    category: 'AI Model',
    description: 'Powers the AI copilot, market briefings, and analysis features',
    fields: [{ key: 'api_key', label: 'API Key', type: 'password' }],
    url: 'https://console.anthropic.com/settings/keys',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    category: 'AI Model',
    description: 'Alternative AI provider for analysis and insights',
    fields: [{ key: 'api_key', label: 'API Key', type: 'password' }],
    url: 'https://platform.openai.com/api-keys',
  },
  {
    id: 'coingecko',
    name: 'CoinGecko',
    category: 'Market Data',
    description: 'Higher rate limits for price data and conversions',
    fields: [{ key: 'api_key', label: 'API Key', type: 'password' }],
    url: 'https://www.coingecko.com/en/api/pricing',
  },
  {
    id: 'etherscan',
    name: 'Etherscan',
    category: 'Blockchain',
    description: 'On-chain data, wallet health, and transaction history',
    fields: [{ key: 'api_key', label: 'API Key', type: 'password' }],
    url: 'https://etherscan.io/myapikey',
  },
  {
    id: 'telegram',
    name: 'Telegram Bot',
    category: 'Notifications',
    description: 'Receive alerts and notifications via Telegram',
    fields: [
      { key: 'bot_token', label: 'Bot Token', type: 'password' },
      { key: 'chat_id', label: 'Chat ID', type: 'text' },
    ],
    url: 'https://t.me/BotFather',
  },
]

function WizardApiKeyCard({ integration, values, onChange }) {
  const [expanded, setExpanded] = useState(false)
  const hasValue = integration.fields.some(f => values[`${integration.id}.${f.key}`])

  return (
    <div className={`wizard-api-card ${hasValue ? 'has-key' : ''}`}>
      <div className="wizard-api-card-header" onClick={() => setExpanded(!expanded)}>
        <div>
          <div className="wizard-api-card-name">
            {integration.name}
            <span className="wizard-api-card-cat">{integration.category}</span>
          </div>
          <div className="wizard-api-card-desc">{integration.description}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {hasValue && <span className="badge badge-green" style={{ fontSize: '0.65rem' }}>Set</span>}
          <span style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>{expanded ? '\u25b2' : '\u25bc'}</span>
        </div>
      </div>
      {expanded && (
        <div className="wizard-api-card-body">
          {integration.fields.map(f => {
            const fieldId = `${integration.id}.${f.key}`
            return (
              <div key={f.key} className="form-group" style={{ marginBottom: '0.6rem' }}>
                <label style={{ fontSize: '0.8rem' }}>{f.label}</label>
                {f.type === 'password' ? (
                  <PasswordInput
                    value={values[fieldId] || ''}
                    onChange={(e) => onChange(fieldId, e.target.value)}
                    placeholder={`Enter ${f.label}`}
                  />
                ) : (
                  <input
                    className="form-input"
                    type="text"
                    value={values[fieldId] || ''}
                    onChange={(e) => onChange(fieldId, e.target.value)}
                    placeholder={`Enter ${f.label}`}
                  />
                )}
              </div>
            )
          })}
          {integration.url && (
            <a
              href={integration.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: '0.8rem', color: 'var(--primary)', textDecoration: 'none' }}
            >
              Get your key &rarr;
            </a>
          )}
        </div>
      )}
    </div>
  )
}

export default function SetupWizard() {
  const { token } = useAuth()
  const navigate = useNavigate()
  const [currentStep, setCurrentStep] = useState(0)
  const [guidance, setGuidance] = useState('')
  const [loading, setLoading] = useState(false)
  const [animating, setAnimating] = useState(false)

  // User selections
  const [experience, setExperience] = useState('')
  const [interests, setInterests] = useState([])
  const [walletAddress, setWalletAddress] = useState('')
  const [risk, setRisk] = useState('Moderate')
  const [completedSteps, setCompletedSteps] = useState([])
  const [apiKeyValues, setApiKeyValues] = useState({})
  const [savingKeys, setSavingKeys] = useState(false)

  const setApiKeyField = (fieldId, value) => {
    setApiKeyValues(prev => ({ ...prev, [fieldId]: value }))
  }

  const saveApiKeys = async () => {
    setSavingKeys(true)
    // Group by integration
    const grouped = {}
    for (const [fieldId, value] of Object.entries(apiKeyValues)) {
      if (!value || !value.trim()) continue
      const [intId, fieldKey] = fieldId.split('.')
      if (!grouped[intId]) grouped[intId] = {}
      grouped[intId][fieldKey] = value.trim()
    }
    for (const [integrationId, fields] of Object.entries(grouped)) {
      try {
        await api.post('/api/keys/keys', { integration_id: integrationId, fields })
      } catch {
        // Continue saving others
      }
    }
    setSavingKeys(false)
  }

  const fetchGuidance = useCallback(async (step, extraInput = {}) => {
    setLoading(true)
    setGuidance('')
    try {
      const res = await fetch('/api/wizard/step', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        credentials: 'include',
        body: JSON.stringify({
          step,
          answer: extraInput.answer || '',
          level: experience,
          interests,
          holdings: extraInput.holdings || '',
          risk,
          completed_steps: completedSteps,
        }),
      })
      const data = await res.json()
      setGuidance(data.guidance || '')
    } catch {
      if (step === 'api_keys') {
        setGuidance('Configure your API keys to unlock the full power of CryptoAdvisor. AI model keys enable the copilot, market briefings, and analysis features. CoinGecko and Etherscan keys remove rate limits for faster data. All keys are optional and encrypted at rest.')
      } else {
        setGuidance('Welcome to CryptoAdvisor! Let me help you get set up.')
      }
    } finally {
      setLoading(false)
    }
  }, [token, experience, interests, risk, completedSteps])

  useEffect(() => {
    fetchGuidance(STEPS[currentStep].key)
  }, [])

  const goToStep = async (stepIndex, extraInput = {}) => {
    // Save API keys when leaving the api_keys step
    if (STEPS[currentStep].key === 'api_keys') {
      await saveApiKeys()
    }
    setAnimating(true)
    setTimeout(() => {
      setCurrentStep(stepIndex)
      fetchGuidance(STEPS[stepIndex].key, extraInput)
      setAnimating(false)
    }, 200)
  }

  const handleNext = () => {
    const stepKey = STEPS[currentStep].key
    if (!completedSteps.includes(stepKey)) {
      setCompletedSteps(prev => [...prev, stepKey])
    }

    if (currentStep === 0 && !experience) {
      return
    }
    if (currentStep === 1 && interests.length === 0) {
      return
    }

    const extraInput = {}
    if (currentStep === 0) extraInput.answer = experience
    if (currentStep === 1) extraInput.answer = interests.join(', ')

    if (currentStep < STEPS.length - 1) {
      goToStep(currentStep + 1, extraInput)
    }
  }

  const handleBack = () => {
    if (currentStep > 0) {
      goToStep(currentStep - 1)
    }
  }

  const handleSkip = () => {
    if (currentStep < STEPS.length - 1) {
      goToStep(currentStep + 1)
    }
  }

  const handleComplete = async () => {
    // Save any remaining API keys
    await saveApiKeys()
    try {
      await fetch('/api/wizard/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        credentials: 'include',
      })
    } catch {
      // Continue anyway
    }
    navigate('/')
  }

  const handleSkipWizard = async () => {
    try {
      await fetch('/api/wizard/skip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        credentials: 'include',
      })
    } catch {
      // Continue anyway
    }
    navigate('/')
  }

  const toggleInterest = (id) => {
    setInterests(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    )
  }

  const connectMetaMask = async () => {
    if (typeof window.ethereum !== 'undefined') {
      try {
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' })
        if (accounts[0]) {
          setWalletAddress(accounts[0])
        }
      } catch {
        // User rejected
      }
    } else {
      alert('MetaMask is not installed. You can add a wallet address manually below.')
    }
  }

  const stepKey = STEPS[currentStep].key
  const canSkip = stepKey === 'api_keys' || stepKey === 'wallet' || stepKey === 'alerts' || stepKey === 'portfolio'

  const configuredKeyCount = Object.values(apiKeyValues).filter(v => v && v.trim()).length

  return (
    <div className="wizard-container">
      {/* Progress indicators */}
      <div className="wizard-progress">
        {STEPS.map((step, i) => (
          <div key={step.key} style={{ display: 'flex', alignItems: 'center' }}>
            <div
              className={`wizard-step-indicator ${
                i < currentStep ? 'completed' : i === currentStep ? 'active' : ''
              }`}
            >
              {i < currentStep ? '\u2713' : i + 1}
            </div>
            {i < STEPS.length - 1 && (
              <div className={`wizard-step-line ${i < currentStep ? 'completed' : ''}`} />
            )}
          </div>
        ))}
      </div>

      {/* AI Guidance Panel */}
      <div className="wizard-ai-guidance">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <span style={{ fontSize: '1.1rem' }}>\u2728</span>
          <strong style={{ color: 'var(--secondary)', fontSize: '0.85rem' }}>AI Setup Assistant</strong>
        </div>
        {loading ? (
          <div className="ai-skeleton">
            <div className="ai-skeleton-line" />
            <div className="ai-skeleton-line" />
            <div className="ai-skeleton-line" />
          </div>
        ) : (
          <div>{guidance}</div>
        )}
      </div>

      {/* Step Content */}
      <div className={`card ${animating ? 'wizard-fade-out' : 'wizard-fade-in'}`}>
        {/* Welcome Step */}
        {stepKey === 'welcome' && (
          <div>
            <h3 style={{ color: 'var(--text)', fontSize: '1.1rem', marginBottom: '1rem', textTransform: 'none' }}>
              What is your crypto experience level?
            </h3>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              {EXPERIENCE_LEVELS.map(level => (
                <button
                  key={level}
                  className={`btn ${experience === level ? '' : 'btn-outline'}`}
                  onClick={() => setExperience(level)}
                  style={{ minWidth: '140px' }}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Interests Step */}
        {stepKey === 'interests' && (
          <div>
            <h3 style={{ color: 'var(--text)', fontSize: '1.1rem', marginBottom: '1rem', textTransform: 'none' }}>
              What are you most interested in?
            </h3>
            <p className="muted" style={{ fontSize: '0.85rem', marginBottom: '1rem' }}>
              Select all that apply. We will personalize your experience.
            </p>
            <div className="wizard-interests-grid">
              {INTEREST_OPTIONS.map(opt => (
                <div
                  key={opt.id}
                  className={`wizard-interest-card ${interests.includes(opt.id) ? 'selected' : ''}`}
                  onClick={() => toggleInterest(opt.id)}
                >
                  <div style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>{opt.icon}</div>
                  {opt.label}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* API Keys Step */}
        {stepKey === 'api_keys' && (
          <div>
            <h3 style={{ color: 'var(--text)', fontSize: '1.1rem', marginBottom: '0.5rem', textTransform: 'none' }}>
              Connect your API keys
            </h3>
            <p className="muted" style={{ fontSize: '0.85rem', marginBottom: '1rem' }}>
              These are optional. You can add or change them later in Settings &gt; API Keys.
              {configuredKeyCount > 0 && (
                <span style={{ color: 'var(--primary)', marginLeft: '0.5rem' }}>
                  ({configuredKeyCount} field{configuredKeyCount !== 1 ? 's' : ''} entered)
                </span>
              )}
            </p>
            <div className="wizard-api-list">
              {WIZARD_INTEGRATIONS.map(integration => (
                <WizardApiKeyCard
                  key={integration.id}
                  integration={integration}
                  values={apiKeyValues}
                  onChange={setApiKeyField}
                />
              ))}
            </div>
            <p className="muted" style={{ fontSize: '0.8rem', marginTop: '1rem' }}>
              More integrations available on the <a href="/api-keys" style={{ color: 'var(--primary)', textDecoration: 'none' }}>API Keys</a> page after setup.
            </p>
          </div>
        )}

        {/* Wallet Step */}
        {stepKey === 'wallet' && (
          <div>
            <h3 style={{ color: 'var(--text)', fontSize: '1.1rem', marginBottom: '1rem', textTransform: 'none' }}>
              Connect or add a wallet
            </h3>
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
              <button className="btn" onClick={connectMetaMask}>
                Connect MetaMask
              </button>
            </div>
            <div className="form-group">
              <label>Or enter a wallet address to watch (read-only, no private keys needed)</label>
              <input
                className="form-input"
                placeholder="0x... or ENS name or Solana address"
                value={walletAddress}
                onChange={(e) => setWalletAddress(e.target.value)}
              />
            </div>
            {walletAddress && (
              <div className="alert alert-success">
                Wallet added: {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
              </div>
            )}
          </div>
        )}

        {/* Alerts Step */}
        {stepKey === 'alerts' && (
          <div>
            <h3 style={{ color: 'var(--text)', fontSize: '1.1rem', marginBottom: '1rem', textTransform: 'none' }}>
              Set up price alerts
            </h3>
            <p className="muted" style={{ fontSize: '0.85rem', marginBottom: '1rem' }}>
              The AI has suggested some alerts above. You can set these up now or later from the Alerts page.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button className="btn btn-sm" onClick={() => navigate('/alerts')}>
                Go to Alerts Page
              </button>
              <button className="btn btn-sm btn-outline" onClick={handleSkip}>
                Set up later
              </button>
            </div>
          </div>
        )}

        {/* Portfolio Step */}
        {stepKey === 'portfolio' && (
          <div>
            <h3 style={{ color: 'var(--text)', fontSize: '1.1rem', marginBottom: '1rem', textTransform: 'none' }}>
              Portfolio goal and risk tolerance
            </h3>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
              {RISK_LEVELS.map(level => (
                <button
                  key={level}
                  className={`btn ${risk === level ? '' : 'btn-outline'}`}
                  onClick={() => {
                    setRisk(level)
                    fetchGuidance('portfolio', { answer: level })
                  }}
                  style={{ minWidth: '140px' }}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Complete Step */}
        {stepKey === 'complete' && (
          <div>
            <h3 style={{ color: 'var(--primary)', fontSize: '1.2rem', marginBottom: '1rem', textTransform: 'none' }}>
              You are all set!
            </h3>
            <div style={{ marginBottom: '1rem' }}>
              <p style={{ fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                <strong>Experience:</strong> {experience || 'Not set'}
              </p>
              <p style={{ fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                <strong>Interests:</strong> {interests.length > 0 ? interests.join(', ') : 'None selected'}
              </p>
              <p style={{ fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                <strong>API Keys:</strong> {configuredKeyCount > 0 ? `${configuredKeyCount} configured` : 'None (you can add later)'}
              </p>
              <p style={{ fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                <strong>Risk tolerance:</strong> {risk}
              </p>
              {walletAddress && (
                <p style={{ fontSize: '0.9rem' }}>
                  <strong>Wallet:</strong> {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
                </p>
              )}
            </div>
            <button className="btn" onClick={handleComplete} style={{ fontSize: '1rem', padding: '0.75rem 2rem' }}>
              {savingKeys ? 'Saving...' : 'Go to Dashboard'}
            </button>
          </div>
        )}
      </div>

      {/* Navigation */}
      {stepKey !== 'complete' && (
        <div className="wizard-actions">
          <div>
            {currentStep > 0 && (
              <button className="btn btn-outline" onClick={handleBack}>
                Back
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            {canSkip && (
              <button className="wizard-skip-btn" onClick={handleSkip}>
                Skip this step
              </button>
            )}
            {currentStep === 0 && (
              <button className="wizard-skip-btn" onClick={handleSkipWizard}>
                Skip wizard
              </button>
            )}
            <button
              className="btn"
              onClick={handleNext}
              disabled={
                (stepKey === 'welcome' && !experience) ||
                (stepKey === 'interests' && interests.length === 0)
              }
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
