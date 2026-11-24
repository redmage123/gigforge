import { useState } from 'react'
import Card from '../components/Card'

export default function DataExport() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleExport = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/account/export', { credentials: 'include' })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data) throw new Error(data?.error || 'Export failed. Please try again.')
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `assetadvisor-export-${new Date().toISOString().split('T')[0]}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <h1>Export My Data</h1>
      <Card title="Data Export">
        <p style={{ color: 'var(--muted)', marginBottom: '1rem', fontSize: '0.9rem' }}>
          Download everything AssetAdvisor holds about you as a JSON file. This includes:
        </p>
        <ul style={{ color: 'var(--text)', fontSize: '0.9rem', lineHeight: 2, paddingLeft: '1.5rem', marginBottom: '1rem' }}>
          <li>Your account details and investor profile</li>
          <li>Portfolios, trades and cash movements</li>
          <li>Saved wallets, watchlists, alerts and DCA plans</li>
          <li>Settings, layouts and notification preferences</li>
          <li>Broker connections (provider, accounts and sync status) and a list of your stored statements</li>
          <li>Which API keys and exchanges you have set up (names only)</li>
          <li>AI memory facts and assistant chat history</li>
          <li>Notifications, sign-in sessions, connected sign-ins, firm memberships and your audit log</li>
        </ul>
        <p style={{ color: 'var(--muted)', marginBottom: '1.5rem', fontSize: '0.85rem' }}>
          Passwords, API keys, exchange keys, broker credentials and access tokens are never included.
          Statement PDFs are listed, not attached: download them from Statements on the Performance page.
        </p>
        {error && <div className="alert alert-error" style={{ marginBottom: '1rem' }}>{error}</div>}
        <button className="btn" onClick={handleExport} disabled={loading}>
          {loading ? 'Compiling data...' : 'Export All My Data'}
        </button>
      </Card>
    </div>
  )
}
