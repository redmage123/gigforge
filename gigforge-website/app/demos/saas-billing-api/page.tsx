'use client'

import { useState } from 'react'
import Link from 'next/link'

type Plan = 'free' | 'pro' | 'enterprise'
type Stage = 'select' | 'checkout' | 'active'

interface WebhookEvent {
  event: string
  ts: string
  payload: string
}

const plans = [
  { id: 'free' as Plan, name: 'Free', price: '$0/mo', seats: 1, requests: '1,000/mo', overage: 'None', color: 'border-bg-tertiary', badge: '' },
  { id: 'pro' as Plan, name: 'Pro', price: '$49/mo', seats: 5, requests: '50,000/mo', overage: '$0.001/req', color: 'border-accent', badge: 'Most Popular' },
  { id: 'enterprise' as Plan, name: 'Enterprise', price: '$299/mo', seats: 50, requests: 'Unlimited', overage: 'Included', color: 'border-violet-500', badge: '' },
]

const usageData = { pro: { used: 31200, limit: 50000 }, enterprise: { used: 142800, limit: Infinity } }

export default function BillingDemo() {
  const [stage, setStage] = useState<Stage>('select')
  const [selectedPlan, setSelectedPlan] = useState<Plan>('pro')
  const [checkoutStep, setCheckoutStep] = useState(0)
  const [webhooks, setWebhooks] = useState<WebhookEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [orgName, setOrgName] = useState('Acme Corp')
  const [invoices] = useState([
    { id: 'INV-001', date: '2026-02-01', amount: '$49.00', status: 'paid' },
    { id: 'INV-002', date: '2026-03-01', amount: '$52.10', status: 'paid', note: '+$3.10 overage' },
  ])

  const checkoutSteps = [
    'Creating organisation…',
    'Validating payment method…',
    'Creating Stripe customer…',
    'Attaching subscription…',
    'Verifying HMAC webhook…',
    'Provisioning tenant…',
  ]

  function addWebhook(event: string, payload: object) {
    setWebhooks((prev) => [
      { event, ts: new Date().toISOString(), payload: JSON.stringify(payload) },
      ...prev,
    ].slice(0, 10))
  }

  async function handleSubscribe() {
    setStage('checkout')
    setCheckoutStep(0)
    setLoading(true)
    for (let i = 0; i < checkoutSteps.length; i++) {
      await new Promise((r) => setTimeout(r, 550))
      setCheckoutStep(i + 1)
      if (i === 3) addWebhook('customer.subscription.created', { plan: selectedPlan, status: 'active', customerId: 'cus_demo123' })
      if (i === 4) addWebhook('invoice.payment_succeeded', { amount: plans.find(p => p.id === selectedPlan)!.price, invoiceId: 'in_demo456' })
    }
    await new Promise((r) => setTimeout(r, 400))
    setLoading(false)
    setStage('active')
    addWebhook('entitlements.updated', { orgId: 'org_demo789', plan: selectedPlan, seats: plans.find(p => p.id === selectedPlan)!.seats })
  }

  async function handleCancel() {
    setLoading(true)
    await new Promise((r) => setTimeout(r, 800))
    addWebhook('customer.subscription.deleted', { plan: selectedPlan, cancelAt: new Date(Date.now() + 86400000 * 30).toISOString() })
    setLoading(false)
    setStage('select')
    setWebhooks([])
    setCheckoutStep(0)
  }

  const usage = selectedPlan !== 'free' ? usageData[selectedPlan as 'pro' | 'enterprise'] : null
  const usagePct = usage && usage.limit !== Infinity ? Math.round((usage.used / usage.limit) * 100) : null

  return (
    <div className="max-w-[1280px] mx-auto px-6 py-16">
      <Link href="/demos" className="text-accent hover:underline mb-6 inline-block text-sm">
        ← All Demos
      </Link>
      <div className="flex items-center gap-4 mb-2">
        <span className="text-3xl">💳</span>
        <h1 className="text-3xl font-bold text-text-primary">SaaS Billing Microservice</h1>
      </div>
      <p className="text-text-secondary mb-10">Full subscription lifecycle with Stripe webhooks. Pick a plan and watch the whole flow.</p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main flow */}
        <div className="lg:col-span-2 space-y-6">

          {/* Plan Selection */}
          {stage === 'select' && (
            <div className="bg-bg-secondary rounded-xl p-6">
              <h2 className="text-lg font-semibold text-text-primary mb-2">Choose a Plan</h2>
              <div className="mb-4">
                <label className="text-xs text-text-secondary mb-1 block">Organisation name</label>
                <input
                  className="bg-bg-primary border border-bg-tertiary rounded-lg px-3 py-2 text-text-primary text-sm focus:outline-none focus:border-accent w-full max-w-xs"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                {plans.map((plan) => (
                  <button
                    key={plan.id}
                    onClick={() => setSelectedPlan(plan.id)}
                    className={`text-left p-4 rounded-xl border-2 transition-all ${selectedPlan === plan.id ? plan.color : 'border-bg-tertiary hover:border-bg-tertiary/80'} ${selectedPlan === plan.id ? 'bg-bg-primary' : 'bg-bg-primary/50'}`}
                  >
                    {plan.badge && (
                      <span className="text-[10px] bg-accent text-white px-2 py-0.5 rounded-full font-medium mb-2 inline-block">{plan.badge}</span>
                    )}
                    <div className="text-lg font-bold text-text-primary">{plan.name}</div>
                    <div className="text-xl font-bold text-accent">{plan.price}</div>
                    <div className="text-xs text-text-secondary mt-2 space-y-1">
                      <div>{plan.seats} seat{plan.seats > 1 ? 's' : ''}</div>
                      <div>{plan.requests}</div>
                      <div>Overage: {plan.overage}</div>
                    </div>
                  </button>
                ))}
              </div>
              <button
                onClick={handleSubscribe}
                className="bg-accent hover:bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold transition-colors"
              >
                Subscribe — {plans.find(p => p.id === selectedPlan)?.price}
              </button>
            </div>
          )}

          {/* Checkout Progress */}
          {stage === 'checkout' && (
            <div className="bg-bg-secondary rounded-xl p-6">
              <h2 className="text-lg font-semibold text-text-primary mb-6">Processing Subscription…</h2>
              <div className="space-y-3">
                {checkoutSteps.map((step, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold transition-colors ${
                      i < checkoutStep ? 'bg-green-600 text-white' :
                      i === checkoutStep && loading ? 'bg-accent text-white animate-pulse' :
                      'bg-bg-tertiary text-text-muted'
                    }`}>
                      {i < checkoutStep ? '✓' : i + 1}
                    </div>
                    <span className={`text-sm ${i < checkoutStep ? 'text-text-primary' : i === checkoutStep && loading ? 'text-accent' : 'text-text-muted'}`}>
                      {step}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Active Subscription */}
          {stage === 'active' && (
            <div className="space-y-4">
              <div className="bg-bg-secondary rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-text-primary">{orgName}</h2>
                  <span className="text-xs bg-green-800 text-green-200 px-3 py-1 rounded-full font-medium">
                    {plans.find(p => p.id === selectedPlan)?.name} — Active
                  </span>
                </div>

                {usage && (
                  <div className="mb-6">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-text-secondary">API Usage this month</span>
                      <span className="text-text-primary font-mono">{usage.used.toLocaleString()} / {usage.limit === Infinity ? '∞' : usage.limit.toLocaleString()}</span>
                    </div>
                    {usagePct !== null && (
                      <div className="w-full bg-bg-tertiary rounded-full h-2">
                        <div
                          className={`h-2 rounded-full transition-all ${usagePct > 80 ? 'bg-orange-500' : 'bg-accent'}`}
                          style={{ width: `${usagePct}%` }}
                        />
                      </div>
                    )}
                    {usagePct !== null && usagePct > 60 && (
                      <p className="text-xs text-orange-400 mt-1">
                        {usagePct > 80 ? `⚠ Approaching limit — overage charges apply at ${plans.find(p => p.id === selectedPlan)?.overage}` : `${usagePct}% used`}
                      </p>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-3 gap-3 text-center mb-4">
                  <div className="bg-bg-primary rounded-lg p-3">
                    <div className="text-lg font-bold text-text-primary">{plans.find(p => p.id === selectedPlan)?.seats}</div>
                    <div className="text-xs text-text-secondary">Seats</div>
                  </div>
                  <div className="bg-bg-primary rounded-lg p-3">
                    <div className="text-lg font-bold text-text-primary">{plans.find(p => p.id === selectedPlan)?.requests}</div>
                    <div className="text-xs text-text-secondary">Requests</div>
                  </div>
                  <div className="bg-bg-primary rounded-lg p-3">
                    <div className="text-lg font-bold text-text-primary">Multi</div>
                    <div className="text-xs text-text-secondary">Tenant</div>
                  </div>
                </div>
              </div>

              {/* Invoices */}
              <div className="bg-bg-secondary rounded-xl p-6">
                <h3 className="text-base font-semibold text-text-primary mb-3">Invoices</h3>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-text-muted text-xs border-b border-bg-tertiary">
                      <th className="pb-2">Invoice</th>
                      <th className="pb-2">Date</th>
                      <th className="pb-2">Amount</th>
                      <th className="pb-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="space-y-1">
                    {invoices.map((inv) => (
                      <tr key={inv.id} className="border-b border-bg-primary/50">
                        <td className="py-2 font-mono text-text-secondary">{inv.id}</td>
                        <td className="py-2 text-text-secondary">{inv.date}</td>
                        <td className="py-2 text-text-primary font-medium">
                          {inv.amount}
                          {inv.note && <span className="text-xs text-orange-400 ml-1">{inv.note}</span>}
                        </td>
                        <td className="py-2">
                          <span className="text-xs bg-green-800 text-green-200 px-2 py-0.5 rounded-full">{inv.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <button
                onClick={handleCancel}
                disabled={loading}
                className="text-sm text-red-400 hover:text-red-300 transition-colors disabled:opacity-50"
              >
                Cancel subscription (fires webhook)
              </button>
            </div>
          )}
        </div>

        {/* Webhook Events */}
        <div className="bg-bg-secondary rounded-xl p-6 flex flex-col">
          <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
            Stripe Webhooks
            {loading && <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />}
          </h2>
          <div className="flex-1 space-y-2 overflow-y-auto max-h-[500px]">
            {webhooks.length === 0 ? (
              <p className="text-text-muted text-sm">Subscribe to see events fire.</p>
            ) : (
              webhooks.map((wh, i) => (
                <div key={i} className="bg-bg-primary rounded-lg p-3 font-mono text-xs space-y-1">
                  <div className="text-violet-400 font-semibold">{wh.event}</div>
                  <div className="text-green-400 break-all">{wh.payload}</div>
                  <div className="text-text-muted text-[10px]">{wh.ts}</div>
                </div>
              ))
            )}
          </div>
          <div className="mt-4 pt-4 border-t border-bg-tertiary">
            <p className="text-xs text-text-muted">Webhooks verified with HMAC-SHA256 signature. Replay attacks rejected.</p>
          </div>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-3 gap-4 text-center">
        <div className="bg-bg-secondary rounded-lg p-4"><div className="text-2xl font-bold text-text-primary">46</div><div className="text-xs text-text-secondary">Tests across 7 suites</div></div>
        <div className="bg-bg-secondary rounded-lg p-4"><div className="text-2xl font-bold text-text-primary">Stripe</div><div className="text-xs text-text-secondary">HMAC webhook verification</div></div>
        <div className="bg-bg-secondary rounded-lg p-4"><div className="text-2xl font-bold text-text-primary">Multi</div><div className="text-xs text-text-secondary">Tenant data isolation</div></div>
      </div>

      <div className="mt-8 text-center">
        <Link href="/portfolio/saas-billing-api" className="text-accent hover:underline text-sm mr-6">View case study →</Link>
        <Link href="/contact" className="inline-block bg-accent text-white px-6 py-2 rounded-lg hover:bg-blue-600 transition-colors text-sm font-medium">Build something similar</Link>
      </div>
    </div>
  )
}
