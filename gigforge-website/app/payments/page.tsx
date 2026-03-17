'use client'

import { useState } from 'react'
import QRCode from 'react-qr-code'
import { Check, Copy, CreditCard, ExternalLink } from 'lucide-react'
import { PayPalScriptProvider, PayPalButtons } from '@paypal/react-paypal-js'

/* ── Types ─────────────────────────────────────────────── */
interface Service {
  id: string
  name: string
  price: string
  priceValue: string // numeric string for PayPal, e.g. "100.00"
  period?: string
  description: string
  stripeLink: string
}

interface CryptoWallet {
  symbol: string
  name: string
  address: string
  color: string
}

/* ── Data ───────────────────────────────────────────────── */
const services: Service[] = [
  {
    id: 'consultation',
    name: 'AI Consultation',
    price: '€100',
    priceValue: '100.00',
    description: '60-min expert session + written action plan',
    stripeLink: 'https://buy.stripe.com/consultation',
  },
  {
    id: 'mvp',
    name: 'MVP Build',
    price: '€2,500',
    priceValue: '2500.00',
    description: 'Full MVP in 2–4 weeks with tests and deployment',
    stripeLink: 'https://buy.stripe.com/mvp-build',
  },
  {
    id: 'basic-retainer',
    name: 'Basic Retainer',
    price: '€500',
    priceValue: '500.00',
    period: '/mo',
    description: 'Up to 10 hrs/mo of ongoing development',
    stripeLink: 'https://buy.stripe.com/basic-retainer',
  },
  {
    id: 'standard-retainer',
    name: 'Standard Retainer',
    price: '€1,000',
    priceValue: '1000.00',
    period: '/mo',
    description: 'Up to 25 hrs/mo + priority support + Slack',
    stripeLink: 'https://buy.stripe.com/standard-retainer',
  },
  {
    id: 'premium-retainer',
    name: 'Premium Retainer',
    price: '€2,000',
    priceValue: '2000.00',
    period: '/mo',
    description: 'Up to 60 hrs/mo, full AI team, SLA-backed',
    stripeLink: 'https://buy.stripe.com/premium-retainer',
  },
]

const cryptoWallets: CryptoWallet[] = [
  {
    symbol: 'ETH',
    name: 'Ethereum',
    address: '0xe2b202C6F5FC06583d2B14561a49608Ec05d1a2d',
    color: '#627EEA',
  },
  {
    symbol: 'BTC',
    name: 'Bitcoin (Lightning)',
    address: 'LN4qfwbQ2Snun9SddfSer1HVvWHsVcxpS',
    color: '#F7931A',
  },
  {
    symbol: 'SOL',
    name: 'Solana',
    address: 'SR3XN4NHJHCF5NPOEB43TLRVLTKC2M57',
    color: '#9945FF',
  },
  {
    symbol: 'XMR',
    name: 'Monero',
    address: '43m2dYhoVUgPgYQSk8kJze5uUxNqDGCVvLa2jhCNCwvugj4aJcq9ho2YgarJHYgzTs8aSEJwzewczLHSEfc6f81jRMscyEU',
    color: '#FF6600',
  },
  {
    symbol: 'ADA',
    name: 'Cardano',
    address: 'addr1q4a4903af3c74e81ebb33cddfc781ca0e55a6b97b0449fc9f0db1ffa8',
    color: '#0033AD',
  },
  {
    symbol: 'DOGE',
    name: 'Dogecoin',
    address: 'DQ9tD41p2Bav7w5FQioRDqqtctfM7AbY1N',
    color: '#C2A633',
  },
]

const PAYPAL_CLIENT_ID =
  'AUwB-c-GrCyWKZYsAwunZwazllh64Y5oJSqhkaXrNLLwiLU54jJr70KHHcKoYk9GooIuohRCba8qlqKI'

/* ── CopyButton ─────────────────────────────────────────── */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      const el = document.createElement('textarea')
      el.value = text
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <button
      onClick={handleCopy}
      title="Copy address"
      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-bg-tertiary hover:bg-bg-secondary border border-bg-tertiary hover:border-accent text-text-secondary hover:text-accent transition-colors"
    >
      {copied ? (
        <>
          <Check className="w-3.5 h-3.5 text-green-400" />
          <span className="text-green-400">Copied!</span>
        </>
      ) : (
        <>
          <Copy className="w-3.5 h-3.5" />
          <span>Copy</span>
        </>
      )}
    </button>
  )
}

/* ── CryptoCard ─────────────────────────────────────────── */
function CryptoCard({ wallet }: { wallet: CryptoWallet }) {
  const [showQR, setShowQR] = useState(false)

  return (
    <div className="bg-bg-secondary rounded-lg border border-bg-tertiary p-5">
      <div className="flex items-center gap-3 mb-4">
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold"
          style={{ backgroundColor: wallet.color }}
        >
          {wallet.symbol}
        </div>
        <div>
          <div className="font-semibold text-text-primary">{wallet.name}</div>
          <div className="text-xs text-text-muted">{wallet.symbol}</div>
        </div>
      </div>

      <div className="bg-bg-primary rounded-md p-3 mb-3 break-all font-mono text-xs text-text-secondary leading-relaxed">
        {wallet.address}
      </div>

      <div className="flex items-center gap-2 mb-3">
        <CopyButton text={wallet.address} />
        <button
          onClick={() => setShowQR((v) => !v)}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-bg-tertiary hover:bg-bg-secondary border border-bg-tertiary hover:border-accent text-text-secondary hover:text-accent transition-colors"
        >
          {showQR ? 'Hide QR' : 'Show QR'}
        </button>
      </div>

      {showQR && (
        <div className="flex justify-center mt-3 p-4 bg-white rounded-lg">
          <QRCode
            value={wallet.address}
            size={160}
            bgColor="#ffffff"
            fgColor="#000000"
            level="M"
          />
        </div>
      )}
    </div>
  )
}

/* ── Page ───────────────────────────────────────────────── */
export default function PaymentsPage() {
  const [selectedService, setSelectedService] = useState<string | null>(null)
  const [paypalSuccess, setPaypalSuccess] = useState(false)
  const [paypalError, setPaypalError] = useState<string | null>(null)

  const selected = services.find((s) => s.id === selectedService)

  return (
    <PayPalScriptProvider
      options={{
        clientId: PAYPAL_CLIENT_ID,
        currency: 'EUR',
        intent: 'capture',
      }}
    >
      <div className="max-w-[1280px] mx-auto px-6 py-16">
        {/* Header */}
        <div className="mb-12">
          <h1 className="text-4xl font-bold text-text-primary mb-4">Payments</h1>
          <p className="text-text-secondary text-lg max-w-2xl">
            Select a service and pay by card via Stripe, PayPal, or send crypto directly to one of
            the wallet addresses below. All prices in EUR.
          </p>
        </div>

        {/* ── Service Selection ── */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold text-text-primary mb-6">1. Choose a Service</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {services.map((svc) => (
              <button
                key={svc.id}
                onClick={() => {
                  setSelectedService(svc.id === selectedService ? null : svc.id)
                  setPaypalSuccess(false)
                  setPaypalError(null)
                }}
                className={`text-left p-5 rounded-lg border transition-colors ${
                  selectedService === svc.id
                    ? 'border-accent bg-accent/10'
                    : 'border-bg-tertiary bg-bg-secondary hover:border-accent/50'
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <span className="font-semibold text-text-primary">{svc.name}</span>
                  {selectedService === svc.id && (
                    <Check className="w-4 h-4 text-accent mt-0.5" />
                  )}
                </div>
                <div className="text-xl font-bold text-accent mb-2">
                  {svc.price}
                  {svc.period && (
                    <span className="text-sm text-text-secondary font-normal">{svc.period}</span>
                  )}
                </div>
                <p className="text-text-secondary text-sm">{svc.description}</p>
              </button>
            ))}
          </div>
        </section>

        {/* ── Stripe Checkout ── */}
        <section className="mb-8">
          <h2 className="text-2xl font-bold text-text-primary mb-6">2. Pay by Card (Stripe)</h2>
          <div className="bg-bg-secondary rounded-lg border border-bg-tertiary p-6">
            {selected ? (
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <p className="text-text-primary font-semibold mb-1">
                    Selected: {selected.name} — {selected.price}
                    {selected.period ?? ''}
                  </p>
                  <p className="text-text-secondary text-sm">
                    Secure payment processed by Stripe. Credit / debit cards accepted.
                  </p>
                </div>
                <a
                  href={selected.stripeLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 bg-accent hover:bg-blue-600 transition-colors text-text-primary font-semibold px-6 py-3 rounded-lg whitespace-nowrap"
                >
                  <CreditCard className="w-4 h-4" />
                  Pay {selected.price}
                  {selected.period ?? ''} via Stripe
                  <ExternalLink className="w-3.5 h-3.5 opacity-70" />
                </a>
              </div>
            ) : (
              <div className="flex items-center gap-3 text-text-muted">
                <CreditCard className="w-5 h-5" />
                <span>Select a service above to get the Stripe checkout link.</span>
              </div>
            )}
          </div>
        </section>

        {/* ── PayPal Checkout ── */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold text-text-primary mb-6">3. Pay with PayPal</h2>
          <div className="bg-bg-secondary rounded-lg border border-bg-tertiary p-6">
            {selected ? (
              <div>
                <p className="text-text-primary font-semibold mb-1">
                  Selected: {selected.name} — {selected.price}
                  {selected.period ?? ''}
                </p>
                <p className="text-text-secondary text-sm mb-6">
                  Pay securely via PayPal. You can use your PayPal balance, bank account, or card.
                </p>

                {paypalSuccess ? (
                  <div className="flex items-center gap-2 text-green-400 font-semibold">
                    <Check className="w-5 h-5" />
                    Payment complete — thank you! We&apos;ll be in touch shortly.
                  </div>
                ) : (
                  <>
                    {paypalError && (
                      <p className="text-red-400 text-sm mb-4">{paypalError}</p>
                    )}
                    {/* max-w keeps the PayPal button from stretching full width */}
                    <div className="max-w-sm">
                      <PayPalButtons
                        style={{ layout: 'vertical', color: 'gold', shape: 'rect', label: 'pay' }}
                        createOrder={(_data, actions) =>
                          actions.order.create({
                            intent: 'CAPTURE',
                            purchase_units: [
                              {
                                description: selected.name,
                                amount: {
                                  currency_code: 'EUR',
                                  value: selected.priceValue,
                                },
                              },
                            ],
                          })
                        }
                        onApprove={async (_data, actions) => {
                          if (actions.order) {
                            await actions.order.capture()
                            setPaypalSuccess(true)
                            setPaypalError(null)
                          }
                        }}
                        onError={(err) => {
                          console.error('PayPal error', err)
                          setPaypalError(
                            'PayPal encountered an error. Please try again or use another payment method.',
                          )
                        }}
                        onCancel={() => {
                          setPaypalError('Payment was cancelled.')
                        }}
                      />
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-3 text-text-muted">
                {/* PayPal icon via text */}
                <span className="font-bold text-[#003087]" style={{ fontFamily: 'sans-serif' }}>
                  Pay<span className="text-[#009cde]">Pal</span>
                </span>
                <span>Select a service above to enable PayPal checkout.</span>
              </div>
            )}
          </div>
        </section>

        {/* ── Crypto Payments ── */}
        <section>
          <h2 className="text-2xl font-bold text-text-primary mb-2">Pay with Crypto</h2>
          <p className="text-text-secondary mb-6">
            Send the agreed amount to any of the addresses below, then email us your transaction
            hash at{' '}
            <a href="mailto:billing@gigforge.ai" className="text-accent hover:underline">
              billing@gigforge.ai
            </a>
            .
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {cryptoWallets.map((wallet) => (
              <CryptoCard key={wallet.symbol} wallet={wallet} />
            ))}
          </div>
        </section>
      </div>
    </PayPalScriptProvider>
  )
}
