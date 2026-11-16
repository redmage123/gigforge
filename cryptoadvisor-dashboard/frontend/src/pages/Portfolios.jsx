import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import Card from '../components/Card'
import InstrumentPicker from '../components/InstrumentPicker'
import { usePortfolios } from '../hooks/usePortfolios'

const KINDS = [['personal', 'Own account'], ['client', 'Client account'], ['model', 'Model portfolio']]
const KIND_LABEL = Object.fromEntries(KINDS)
const label = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.8rem', color: 'var(--muted)' }

function PortfolioForm({ initial, onSave, onCancel, submitLabel }) {
  const [f, setF] = useState({ name: '', kind: 'personal', client_name: '', benchmark: 'index:SPX', notes: '', ...initial })
  const [benchName, setBenchName] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submit = async (e) => {
    e.preventDefault()
    setBusy(true); setError('')
    try { await onSave(f) } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  return (
    <form onSubmit={submit} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end' }}>
      <label style={label}>Name
        <input className="input" required maxLength={60} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Smith family trust" />
      </label>
      <label style={label}>Type
        <select className="input" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
          {KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </label>
      {f.kind === 'client' && (
        <label style={label}>Client name
          <input className="input" maxLength={80} value={f.client_name} onChange={(e) => setF({ ...f, client_name: e.target.value })} />
        </label>
      )}
      <div style={label}>
        Benchmark <span style={{ fontSize: '0.7rem' }}>now: {benchName || f.benchmark}</span>
        <InstrumentPicker value={null} tradableOnly={false} placeholder="S&P 500, BTC, AGG…"
          onChange={(inst) => { if (inst) { setF({ ...f, benchmark: inst.id }); setBenchName(`${inst.symbol} (${inst.name})`) } }} />
      </div>
      <button className="btn" disabled={busy}>{busy ? 'Saving…' : submitLabel}</button>
      {onCancel && <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>}
      {error && <div className="negative" role="alert" style={{ width: '100%', fontSize: '0.85rem' }}>{error}</div>}
    </form>
  )
}

function Sharing({ p }) {
  const [members, setMembers] = useState(null)
  const [username, setUsername] = useState('')
  const [role, setRole] = useState('viewer')
  const [error, setError] = useState('')
  const load = () => api.get(`/api/portfolios/${p.id}/members`).then((r) => setMembers(r.members)).catch((e) => setError(e.message))
  if (members === null && !error) load()
  const add = async (e) => {
    e.preventDefault(); setError('')
    try { setMembers((await api.post(`/api/portfolios/${p.id}/members`, { username: username.trim(), role })).members); setUsername('') } catch (err) { setError(err.message) }
  }
  const remove = async (u) => {
    try { setMembers((await api.del(`/api/portfolios/${p.id}/members/${encodeURIComponent(u)}`)).members) } catch (err) { setError(err.message) }
  }
  return (
    <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid #2a2a3d' }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>Access</div>
      <p className="muted" style={{ fontSize: '0.8rem', margin: '0 0 0.5rem' }}>
        <strong>Viewer</strong>: sees holdings, performance and statements, can't change anything (for the client).
        {' '}<strong>Manager</strong>: can also log trades and cash movements (for a colleague). They need an AssetAdvisor account.
      </p>
      {(members || []).map((m) => (
        <div key={m.username} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.85rem', padding: '2px 0' }}>
          <span>{m.username}</span><span className="badge badge-blue">{m.role}</span>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => remove(m.username)} aria-label={`Remove ${m.username}`}>Remove</button>
        </div>
      ))}
      <form onSubmit={add} style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
        <label className="sr-only" htmlFor={`share-${p.id}`}>Username</label>
        <input id={`share-${p.id}`} className="input" style={{ minWidth: 0, width: 180 }} placeholder="Their username" value={username} onChange={(e) => setUsername(e.target.value)} required />
        <label className="sr-only" htmlFor={`role-${p.id}`}>Role</label>
        <select id={`role-${p.id}`} className="input" style={{ minWidth: 0, width: 130 }} value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="viewer">Viewer</option><option value="manager">Manager</option>
        </select>
        <button className="btn btn-sm">Give access</button>
      </form>
      {error && <div className="negative" role="alert" style={{ fontSize: '0.8rem', marginTop: 4 }}>{error}</div>}
    </div>
  )
}

function PortfolioCard({ p, others, onChanged }) {
  const { setCurrent, current } = usePortfolios()
  const navigate = useNavigate()
  const [mode, setMode] = useState(null) // edit | delete | share
  const [moveTo, setMoveTo] = useState(others[0]?.id || '')
  const [error, setError] = useState('')
  const open = () => { setCurrent(p.id); navigate('/portfolio') }
  const remove = async () => {
    setError('')
    try {
      await api.del(`/api/portfolios/${p.id}${moveTo ? `?move_to=${encodeURIComponent(moveTo)}` : ''}`)
      if (current === p.id) setCurrent('all')
      onChanged()
    } catch (err) { setError(err.message) }
  }
  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ margin: 0 }}>{p.name} {p.default && <span className="badge badge-blue" style={{ fontSize: '0.7rem' }}>default</span>}</h3>
          <div className="muted" style={{ fontSize: '0.85rem', marginTop: 4 }}>
            {KIND_LABEL[p.kind]}{p.client_name ? ` · ${p.client_name}` : ''} · {p.trade_count} trades · benchmark {p.benchmark}
            {p.shared_with > 0 && ` · shared with ${p.shared_with}`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <button type="button" className="btn btn-sm" onClick={open}>Open</button>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setMode(mode === 'edit' ? null : 'edit')}>Edit</button>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setMode(mode === 'share' ? null : 'share')}>Access</button>
          {!p.default && <button type="button" className="btn btn-sm btn-ghost" onClick={() => setMode(mode === 'delete' ? null : 'delete')}>Delete</button>}
        </div>
      </div>
      {mode === 'edit' && (
        <div style={{ marginTop: '0.75rem' }}>
          <PortfolioForm initial={p} submitLabel="Save" onCancel={() => setMode(null)}
            onSave={async (f) => { await api.put(`/api/portfolios/${p.id}`, f); setMode(null); onChanged() }} />
        </div>
      )}
      {mode === 'share' && <Sharing p={p} />}
      {mode === 'delete' && (
        <div style={{ marginTop: '0.75rem', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', fontSize: '0.85rem' }}>
          <span>Its {p.trade_count} trades and cash entries:</span>
          <select className="input" style={{ minWidth: 0, width: 240 }} value={moveTo} onChange={(e) => setMoveTo(e.target.value)} aria-label="What happens to its trades">
            {others.map((o) => <option key={o.id} value={o.id}>Move to {o.name}</option>)}
            <option value="">Delete them too</option>
          </select>
          <button type="button" className="btn btn-sm btn-danger" onClick={remove}>Delete {p.name}</button>
          {error && <span className="negative" role="alert">{error}</span>}
        </div>
      )}
    </Card>
  )
}

export default function Portfolios() {
  const { own, shared, refresh, setCurrent, current } = usePortfolios()
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)

  const leave = async (p) => {
    await api.post(`/api/portfolios/${p.id}/leave`, {})
    if (current === p.id) setCurrent('all')
    refresh()
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0 }}>Portfolios</h1>
        <button type="button" className="btn" onClick={() => setCreating(!creating)}>New portfolio</button>
        {own.length > 1 && <button type="button" className="btn btn-ghost" onClick={() => { setCurrent('all'); navigate('/portfolio') }}>View all combined</button>}
      </div>
      <p className="muted" style={{ marginTop: 0 }}>
        Keep separate books: your own accounts, each client's account, or model portfolios. Every trade, cash movement
        and report belongs to one portfolio; pick which one you're looking at with the switcher in the top bar.
      </p>
      {creating && (
        <Card title="New portfolio">
          <PortfolioForm submitLabel="Create" onCancel={() => setCreating(false)}
            onSave={async (f) => { const p = await api.post('/api/portfolios/', f); setCreating(false); await refresh(); setCurrent(p.id) }} />
        </Card>
      )}
      <div style={{ display: 'grid', gap: '1rem', marginTop: '1rem' }}>
        {own.map((p) => <PortfolioCard key={p.id} p={p} others={own.filter((o) => o.id !== p.id)} onChanged={refresh} />)}
      </div>
      {shared.length > 0 && (
        <>
          <h2 style={{ marginTop: '2rem' }}>Shared with me</h2>
          <div style={{ display: 'grid', gap: '1rem' }}>
            {shared.map((p) => (
              <Card key={p.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                  <div>
                    <h3 style={{ margin: 0 }}>{p.name}</h3>
                    <div className="muted" style={{ fontSize: '0.85rem', marginTop: 4 }}>
                      Managed by {p.owner} · your access: {p.role === 'viewer' ? 'view only' : 'manager'} · {p.trade_count} trades
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button type="button" className="btn btn-sm" onClick={() => { setCurrent(p.id); navigate('/portfolio') }}>Open</button>
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => leave(p)}>Remove from my list</button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
