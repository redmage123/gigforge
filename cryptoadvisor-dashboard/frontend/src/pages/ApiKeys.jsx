import { useState, useEffect } from 'react'
import { api } from '../api/client'
import Card from '../components/Card'
import LoadingSpinner from '../components/LoadingSpinner'
import PasswordInput from '../components/PasswordInput'

function IntegrationCard({ integration, savedKeys, onSave, onDelete }) {
  const [editing, setEditing] = useState(false)
  const [fields, setFields] = useState({})
  const [saving, setSaving] = useState(false)

  const isConfigured = savedKeys && Object.keys(savedKeys).length > 0

  const updateField = (key, val) => setFields(prev => ({ ...prev, [key]: val }))

  const handleSave = async () => {
    setSaving(true)
    await onSave(integration.id, fields)
    setFields({})
    setEditing(false)
    setSaving(false)
  }

  const handleDelete = async () => {
    await onDelete(integration.id)
  }

  return (
    <div className={`api-key-card ${isConfigured ? 'configured' : ''}`}>
      <div className="api-key-header">
        <div className="api-key-info">
          <div className="api-key-name">{integration.name}</div>
          <div className="api-key-desc">{integration.description}</div>
        </div>
        <div className="api-key-status">
          {isConfigured ? (
            <span className="badge badge-green">Connected</span>
          ) : (
            <span className="badge" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--muted)' }}>Not set</span>
          )}
        </div>
      </div>

      {/* Show masked keys if configured */}
      {isConfigured && !editing && (
        <div className="api-key-masked">
          {Object.entries(savedKeys).map(([k, v]) => (
            <div key={k} className="api-key-masked-field">
              <span className="muted">{k}:</span> <code>{v.masked}</code>
            </div>
          ))}
        </div>
      )}

      {/* Edit form */}
      {editing && (
        <div className="api-key-form">
          {integration.fields.map(f => (
            <div key={f.key} className="form-group" style={{ marginBottom: '0.75rem' }}>
              <label>{f.label}</label>
              {f.type === 'password' ? (
                <PasswordInput
                  value={fields[f.key] || ''}
                  onChange={(e) => updateField(f.key, e.target.value)}
                  placeholder={isConfigured ? 'Enter new value to update' : `Enter ${f.label}`}
                />
              ) : (
                <input
                  className="form-input"
                  type="text"
                  value={fields[f.key] || ''}
                  onChange={(e) => updateField(f.key, e.target.value)}
                  placeholder={isConfigured ? 'Enter new value to update' : `Enter ${f.label}`}
                />
              )}
            </div>
          ))}
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn btn-sm" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button className="btn btn-sm btn-outline" onClick={() => { setEditing(false); setFields({}) }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Actions */}
      {!editing && (
        <div className="api-key-actions">
          <button className="btn btn-sm btn-outline" onClick={() => setEditing(true)}>
            {isConfigured ? 'Update' : 'Configure'}
          </button>
          {isConfigured && (
            <button className="btn btn-sm btn-outline" style={{ color: 'var(--accent)', borderColor: 'var(--accent)' }} onClick={handleDelete}>
              Remove
            </button>
          )}
          {integration.url && (
            <a href={integration.url} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-outline" style={{ textDecoration: 'none' }}>
              Get Key
            </a>
          )}
        </div>
      )}
    </div>
  )
}

export default function ApiKeys() {
  const [integrations, setIntegrations] = useState([])
  const [categories, setCategories] = useState({})
  const [userKeys, setUserKeys] = useState({})
  const [loading, setLoading] = useState(true)

  const fetchAll = async () => {
    setLoading(true)
    try {
      const [intData, keyData] = await Promise.all([
        api.get('/api/keys/integrations'),
        api.get('/api/keys/keys'),
      ])
      setIntegrations(intData.integrations || [])
      setCategories(intData.categories || {})
      setUserKeys(keyData.keys || {})
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchAll() }, [])

  const handleSave = async (integrationId, fields) => {
    try {
      await api.post('/api/keys/keys', { integration_id: integrationId, fields })
      await fetchAll()
    } catch {
      // ignore
    }
  }

  const handleDelete = async (integrationId) => {
    try {
      await api.del(`/api/keys/keys/${integrationId}`)
      await fetchAll()
    } catch {
      // ignore
    }
  }

  if (loading) return <LoadingSpinner />

  const configuredCount = Object.keys(userKeys).length

  // Group by category
  const grouped = {}
  for (const i of integrations) {
    const cat = i.category || 'other'
    if (!grouped[cat]) grouped[cat] = []
    grouped[cat].push(i)
  }

  return (
    <div>
      <h1>API Keys & Integrations</h1>

      <div className="api-keys-summary">
        <div className="api-keys-stat">
          <span className="api-keys-stat-value">{configuredCount}</span>
          <span className="api-keys-stat-label">Configured</span>
        </div>
        <div className="api-keys-stat">
          <span className="api-keys-stat-value">{integrations.length - configuredCount}</span>
          <span className="api-keys-stat-label">Available</span>
        </div>
        <div className="api-keys-stat">
          <span className="api-keys-stat-value">{integrations.length}</span>
          <span className="api-keys-stat-label">Total Integrations</span>
        </div>
      </div>

      <p className="muted" style={{ marginBottom: '1.5rem', fontSize: '0.88rem' }}>
        All keys are encrypted at rest. We never display full key values. You can update or remove keys at any time.
      </p>

      {Object.entries(categories).map(([catId, catName]) => {
        const items = grouped[catId]
        if (!items || items.length === 0) return null
        return (
          <Card key={catId} title={catName}>
            <div className="api-key-list">
              {items.map(integration => (
                <IntegrationCard
                  key={integration.id}
                  integration={integration}
                  savedKeys={userKeys[integration.id]}
                  onSave={handleSave}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          </Card>
        )
      })}
    </div>
  )
}
