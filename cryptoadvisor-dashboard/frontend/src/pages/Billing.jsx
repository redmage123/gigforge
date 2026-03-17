import { useState, useEffect } from 'react'
import { useFetch } from '../hooks/useFetch'
import Card from '../components/Card'
import LoadingSpinner from '../components/LoadingSpinner'

const methodIcons = {
  stripe: (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
      <line x1="1" y1="10" x2="23" y2="10" />
    </svg>
  ),
  btc: (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
      <path d="M11.5 1v2.07C7.89 3.55 5.13 6.29 4.57 9.87L2.5 10l-.01 2 2.08.13c.56 3.58 3.32 6.32 6.93 6.8V21h2v-2.07c3.61-.48 6.37-3.22 6.93-6.8l2.07-.13v-2l-2.07-.13c-.56-3.58-3.32-6.32-6.93-6.8V1h-2zm0 4.09c2.6.46 4.63 2.49 5.09 5.04H7.41c.46-2.55 2.49-4.58 5.09-5.04v5.04h-1v2h1v5.04c-2.6-.46-4.63-2.49-5.09-5.04h9.18c-.46 2.55-2.49 4.58-5.09 5.04v-5.04h1v-2h-1V5.09z"/>
    </svg>
  ),
  eth: (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 1.5l-7 10.17L12 15.72l7-4.05L12 1.5zM5 13.34L12 22.5l7-9.16-7 4.05-7-4.05z"/>
    </svg>
  ),
}

function PlanCard({ plan, current, enabled, onSelect }) {
  const isCurrent = current === plan.id
  const isFree = plan.price_usd === 0

  return (
    <div className={`billing-plan-card ${isCurrent ? 'current' : ''} ${plan.id === 'premium' ? 'featured' : ''}`}>
      {plan.id === 'premium' && <div className="plan-badge">Most Popular</div>}
      <h3 className="plan-name">{plan.name}</h3>
      <div className="plan-price">
        {isFree ? (
          <span className="plan-amount">Free</span>
        ) : (
          <>
            <span className="plan-currency">$</span>
            <span className="plan-amount">{plan.price_usd}</span>
            <span className="plan-interval">/{plan.interval}</span>
          </>
        )}
      </div>
      <ul className="plan-features">
        {plan.features.map((f, i) => (
          <li key={i}>{f}</li>
        ))}
      </ul>
      {isCurrent ? (
        <button className="btn plan-btn current-btn" disabled>Current Plan</button>
      ) : isFree ? (
        <button className="btn btn-outline plan-btn" disabled>Downgrade</button>
      ) : (
        <button
          className="btn plan-btn"
          disabled={!enabled}
          onClick={() => onSelect(plan)}
        >
          {enabled ? 'Upgrade' : 'Coming Soon'}
        </button>
      )}
    </div>
  )
}

function PaymentMethodSelector({ plan, onClose }) {
  const [method, setMethod] = useState(null)

  return (
    <div className="ai-modal-overlay" onClick={onClose}>
      <div className="ai-modal billing-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ai-modal-header">
          <h3>Choose Payment Method</h3>
          <button className="ai-modal-close" onClick={onClose}>&times;</button>
        </div>
        <p className="muted" style={{ marginBottom: '1.25rem', fontSize: '0.9rem' }}>
          Upgrade to <strong style={{ color: 'var(--primary)' }}>{plan.name}</strong> &mdash; ${plan.price_usd}/{plan.interval}
        </p>

        <div className="payment-methods">
          <button
            className={`payment-method-card ${method === 'stripe' ? 'selected' : ''}`}
            onClick={() => setMethod('stripe')}
          >
            <div className="pm-icon">{methodIcons.stripe}</div>
            <div className="pm-info">
              <div className="pm-name">Credit / Debit Card</div>
              <div className="pm-desc">Visa, Mastercard, Amex via Stripe</div>
            </div>
          </button>

          <button
            className={`payment-method-card ${method === 'btc' ? 'selected' : ''}`}
            onClick={() => setMethod('btc')}
          >
            <div className="pm-icon" style={{ color: '#f7931a' }}>{methodIcons.btc}</div>
            <div className="pm-info">
              <div className="pm-name">Bitcoin</div>
              <div className="pm-desc">{plan.price_btc} BTC</div>
            </div>
          </button>

          <button
            className={`payment-method-card ${method === 'eth' ? 'selected' : ''}`}
            onClick={() => setMethod('eth')}
          >
            <div className="pm-icon" style={{ color: '#627eea' }}>{methodIcons.eth}</div>
            <div className="pm-info">
              <div className="pm-name">Ethereum</div>
              <div className="pm-desc">{plan.price_eth} ETH</div>
            </div>
          </button>
        </div>

        <button
          className="btn"
          style={{ width: '100%', marginTop: '1.25rem' }}
          disabled={!method}
          onClick={() => {
            // This would call the checkout API when enabled
            alert('Payments are currently in testing mode.')
          }}
        >
          {method ? `Pay with ${method === 'stripe' ? 'Card' : method.toUpperCase()}` : 'Select a payment method'}
        </button>
      </div>
    </div>
  )
}

export default function Billing() {
  const { data: status, loading: ls } = useFetch('/api/payments/status')
  const { data: plansData, loading: lp } = useFetch('/api/payments/plans')
  const { data: subscription, loading: lsub } = useFetch('/api/payments/subscription')
  const { data: historyData, loading: lh } = useFetch('/api/payments/history')

  const [selectedPlan, setSelectedPlan] = useState(null)

  if (ls || lp) return <LoadingSpinner />

  const enabled = status?.enabled || false
  const plans = plansData?.plans || []
  const currentPlan = subscription?.plan_id || 'free'
  const payments = historyData?.payments || []

  return (
    <div>
      <h1>Billing & Subscription</h1>

      {!enabled && (
        <div className="billing-banner">
          <div className="billing-banner-icon">&#128679;</div>
          <div>
            <strong>Payments Coming Soon</strong>
            <p>We're currently in testing mode. Subscription features will be available at launch. All users have full access during the beta period.</p>
          </div>
        </div>
      )}

      <div className="billing-plans">
        {plans.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            current={currentPlan}
            enabled={enabled}
            onSelect={setSelectedPlan}
          />
        ))}
      </div>

      <Card title="Payment Methods">
        <div className="billing-payment-methods-summary">
          <div className="pm-accepted">
            <div className="pm-accepted-item">
              <span style={{ color: 'var(--text)' }}>{methodIcons.stripe}</span>
              <span>Visa, Mastercard, Amex</span>
            </div>
            <div className="pm-accepted-item">
              <span style={{ color: '#f7931a' }}>{methodIcons.btc}</span>
              <span>Bitcoin (BTC)</span>
            </div>
            <div className="pm-accepted-item">
              <span style={{ color: '#627eea' }}>{methodIcons.eth}</span>
              <span>Ethereum (ETH)</span>
            </div>
          </div>
          {!enabled && <p className="muted" style={{ marginTop: '0.75rem', fontSize: '0.85rem' }}>Payment processing will be enabled when we exit testing mode.</p>}
        </div>
      </Card>

      <Card title="Payment History">
        {payments.length === 0 ? (
          <p className="muted">No payment history yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Plan</th>
                <th>Amount</th>
                <th>Method</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p, i) => (
                <tr key={i}>
                  <td>{new Date(p.date).toLocaleDateString()}</td>
                  <td>{p.plan}</td>
                  <td>{p.amount}</td>
                  <td>{p.method}</td>
                  <td><span className={`badge badge-${p.status === 'completed' ? 'green' : 'yellow'}`}>{p.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {selectedPlan && (
        <PaymentMethodSelector
          plan={selectedPlan}
          onClose={() => setSelectedPlan(null)}
        />
      )}
    </div>
  )
}
