import { useState } from 'react'
import Card from '../components/Card'

export default function DataExport() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleExport = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/settings/export', { credentials: 'include' })
      if (!res.ok) throw new Error('Export failed')
      const data = await res.json()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `cryptoadvisor-export-${new Date().toISOString().split('T')[0]}.json`
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
          Download all your data as a JSON file. This includes:
        </p>
        <ul style={{ color: 'var(--text)', fontSize: '0.9rem', lineHeight: 2, paddingLeft: '1.5rem', marginBottom: '1.5rem' }}>
          <li>Saved wallets and balances</li>
          <li>Trade history</li>
          <li>Price alerts</li>
          <li>DCA plans</li>
          <li>Portfolio snapshots</li>
          <li>Settings and preferences</li>
          <li>Exchange connections (keys are NOT exported)</li>
        </ul>
        {error && <div className="alert alert-error" style={{ marginBottom: '1rem' }}>{error}</div>}
        <button className="btn" onClick={handleExport} disabled={loading}>
          {loading ? 'Compiling data...' : 'Export All My Data'}
        </button>
      </Card>
    </div>
  )
}
