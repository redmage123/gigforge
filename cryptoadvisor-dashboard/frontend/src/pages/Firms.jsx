import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import Card from '../components/Card'
import LoadingSpinner from '../components/LoadingSpinner'
import { usePortfolios } from '../hooks/usePortfolios'

const ROLE_LABEL = { admin: 'Admin', pm: 'Portfolio manager', analyst: 'Analyst', compliance: 'Compliance', viewer: 'Viewer' }

// Optional team accounts. Individual traders never need this page.
export default function Firms() {
  const [data, setData] = useState(null)
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const { refresh } = usePortfolios()

  useEffect(() => { api.get('/api/firms/').then(setData).catch((e) => setError(e.message)) }, [])

  const create = async (e) => {
    e.preventDefault(); setError('')
    try {
      const f = await api.post('/api/firms/', { name })
      await refresh()
      navigate(`/firm/${f.id}`)
    } catch (err) { setError(err.message) }
  }

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Firm accounts</h1>
      <p className="muted" style={{ marginTop: 0, maxWidth: 720 }}>
        For teams: a firm owns portfolios that its members work on together, with roles, invitations, company sign-in
        (SSO) and an audit trail. Your personal portfolios stay yours and separate. Using AssetAdvisor on your own
        doesn't need a firm.
      </p>
      {error && <p className="negative" role="alert">{error}</p>}
      {!data ? <LoadingSpinner /> : !data.available ? (
        <Card><p className="muted" style={{ margin: 0 }}>Firm accounts aren't available on this server.</p></Card>
      ) : (
        <>
          {data.firms.length > 0 && (
            <div style={{ display: 'grid', gap: '1rem', marginBottom: '1rem' }}>
              {data.firms.map((f) => (
                <Card key={f.id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                    <div>
                      <h3 style={{ margin: 0 }}>{f.name}</h3>
                      <div className="muted" style={{ fontSize: '0.85rem' }}>Your role: {ROLE_LABEL[f.role]} · {f.portfolios.length} portfolio(s)</div>
                    </div>
                    <Link className="btn btn-sm" to={`/firm/${f.id}`}>Open</Link>
                  </div>
                </Card>
              ))}
            </div>
          )}
          <Card title="Create a firm">
            <form onSubmit={create} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <label className="form-group" style={{ marginBottom: 0, flex: '1 1 260px' }}>Firm name
                <input className="input" required minLength={2} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Harbor Capital Partners" />
              </label>
              <button className="btn">Create firm</button>
            </form>
            <p className="muted" style={{ fontSize: '0.8rem', marginBottom: 0 }}>You'll be its admin. Invite colleagues and clients afterwards.</p>
          </Card>
        </>
      )}
    </div>
  )
}
