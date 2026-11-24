import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../api/client'
import Card from '../components/Card'
import LoadingSpinner from '../components/LoadingSpinner'

function PlanCard({ plan, sub, onUpgrade, busy }) {
  const isCurrent = sub.plan_id === plan.id
  const isFree = plan.price_usd === 0
  const label = `${plan.name} plan`
  return (
    <section className={`billing-plan-card ${isCurrent ? 'current' : ''} ${!isFree ? 'featured' : ''}`} aria-label={label}>
      <h3 className="plan-name">{plan.name}</h3>
      <div className="plan-price">
        {isFree ? <span className="plan-amount">Free</span> : (
          <>
            <span className="plan-currency">$</span>
            <span className="plan-amount">{plan.price_usd}</span>
            <span className="plan-interval">/{plan.interval}</span>
          </>
        )}
      </div>
      <ul className="plan-features">
        {plan.features.map((f) => <li key={f}>{f}</li>)}
      </ul>
      {isCurrent ? (
        <button type="button" className="btn plan-btn current-btn" disabled>Current plan</button>
      ) : isFree ? null : (
        <button type="button" className="btn plan-btn" disabled={!sub.card || busy} onClick={() => onUpgrade(plan)}>
          {!sub.card ? 'Coming soon' : busy ? 'Opening checkout…' : `Subscribe to ${plan.name}`}
        </button>
      )}
    </section>
  )
}

export default function Billing() {
  const [params] = useSearchParams()
  const [plans, setPlans] = useState(null)
  const [sub, setSub] = useState(null)
  const [history, setHistory] = useState([])
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(() => Promise.all([
    api.get('/api/payments/plans').then((d) => setPlans(d.plans || [])),
    api.get('/api/payments/subscription').then(setSub),
    api.get('/api/payments/history').then((d) => setHistory(d.payments || [])),
  ]).catch((e) => setError(e.message)), [])
  useEffect(() => { load() }, [load])

  // Back from Stripe: the webhook may land a moment after the redirect, so look again shortly
  const checkout = params.get('checkout')
  useEffect(() => {
    if (checkout !== 'success') return
    const t = setTimeout(load, 3000)
    return () => clearTimeout(t)
  }, [checkout, load])

  const go = async (key, path, body) => {
    setBusy(key); setError('')
    try {
      const r = await api.post(path, body || {})
      window.location.assign(r.checkout_url || r.url)
    } catch (e) { setError(e.message); setBusy('') }
  }

  if (!plans || !sub) return error ? <Card title="Billing"><p className="negative">{error}</p></Card> : <LoadingSpinner />

  const paid = sub.plan_id !== 'free'
  return (
    <div style={{ maxWidth: 900 }}>
      <h1 style={{ marginTop: 0 }}>Billing &amp; plan</h1>
      <p className="muted">
        AssetAdvisor is free. The Pro plan adds WhatsApp: alerts, In-Play, the daily briefing and chat with the
        assistant on your phone. WhatsApp charges for every business message, so it needs a paid plan.
      </p>
      {error && <p className="negative" role="alert">{error}</p>}
      {checkout === 'success' && (
        <p className="positive" role="status" style={{ margin: '0.5rem 0 1rem' }}>
          {sub.whatsapp ? 'Thank you, Pro is active. ' : 'Thank you. Your payment is being confirmed; this page updates in a moment. '}
          {sub.whatsapp && <Link to="/whatsapp">Set up WhatsApp now</Link>}
        </p>
      )}
      {checkout === 'cancelled' && <p className="muted" role="status" style={{ margin: '0.5rem 0 1rem' }}>Checkout cancelled. You haven't been charged.</p>}
      {!sub.card && (
        <div className="billing-banner">
          <div className="billing-banner-icon" aria-hidden="true">&#128679;</div>
          <div>
            <strong>Subscriptions open soon</strong>
            <p>Paying by card isn't switched on yet. Everything except WhatsApp is free in the meantime.</p>
          </div>
        </div>
      )}

      <div className="billing-plans">
        {plans.map((p) => <PlanCard key={p.id} plan={p} sub={sub} busy={busy === 'checkout'}
          onUpgrade={(plan) => go('checkout', '/api/payments/checkout/stripe', { plan_id: plan.id })} />)}
      </div>

      {paid && (
        <Card title="Your subscription">
          <p style={{ marginTop: 0 }}>
            <strong>{plans.find((p) => p.id === sub.plan_id)?.name || sub.plan_id}</strong>
            {sub.payment_method === 'comp' && <span className="muted"> · given by AssetAdvisor support</span>}
            {sub.status === 'past_due' && <span className="negative"> · the last payment failed; please update your card</span>}
            {sub.expires_at && (
              <span className="muted"> · {sub.cancel_at_period_end || sub.payment_method === 'comp' ? 'ends' : 'renews'} {new Date(sub.expires_at).toLocaleDateString()}</span>
            )}
          </p>
          {sub.can_manage && (
            <div style={{ marginTop: '0.75rem' }}>
              <button type="button" className="btn btn-sm" disabled={!!busy} onClick={() => go('portal', '/api/payments/portal')}>
                {busy === 'portal' ? 'Opening…' : 'Manage subscription'}
              </button>
            </div>
          )}
          {sub.can_manage && <p className="muted" style={{ fontSize: '0.85rem', marginBottom: 0 }}>Change your card, download invoices or cancel on Stripe's secure page.</p>}
        </Card>
      )}

      <Card title="Payment history" className="mt-1">
        {history.length === 0 ? <p className="muted" style={{ margin: 0 }}>No payments yet.</p> : (
          <table>
            <caption className="sr-only">Payment history</caption>
            <thead><tr><th scope="col">Date</th><th scope="col">Plan</th><th scope="col">Amount</th><th scope="col">Status</th><th scope="col">Invoice</th></tr></thead>
            <tbody>
              {history.map((p) => (
                <tr key={p.id || p.date}>
                  <td>{new Date(p.date).toLocaleDateString()}</td>
                  <td>{p.plan}</td>
                  <td>{p.amount}</td>
                  <td><span className={`badge badge-${p.status === 'completed' ? 'green' : 'red'}`}>{p.status === 'completed' ? 'Paid' : 'Failed'}</span></td>
                  <td>{p.invoice_url ? <a href={p.invoice_url} target="_blank" rel="noopener noreferrer">View</a> : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}
