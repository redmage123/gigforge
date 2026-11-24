import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../api/client'
import Card from '../components/Card'
import LoadingSpinner from '../components/LoadingSpinner'
import { usePortfolios } from '../hooks/usePortfolios'

const ROLES = [['admin', 'Admin'], ['pm', 'Portfolio manager'], ['analyst', 'Analyst'], ['compliance', 'Compliance'], ['viewer', 'Viewer']]
const ROLE_LABEL = Object.fromEntries(ROLES)
const field = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.8rem', color: 'var(--muted)' }
const when = (iso) => (iso ? new Date(iso).toLocaleString() : '—')

function Portfolios({ firm, onChange }) {
  const { own, setCurrent } = usePortfolios()
  const navigate = useNavigate()
  const [f, setF] = useState({ name: '', kind: 'client', client_name: '' })
  const [move, setMove] = useState('')
  const [error, setError] = useState('')
  const canWrite = firm.role === 'admin' || firm.role === 'pm'
  const movable = own.filter((p) => !p.default)
  const create = async (e) => {
    e.preventDefault(); setError('')
    try { await api.post(`/api/firms/${firm.id}/portfolios`, f); setF({ name: '', kind: 'client', client_name: '' }); onChange() } catch (err) { setError(err.message) }
  }
  const transfer = async () => {
    if (!move) return
    const p = own.find((x) => x.id === move)
    if (!window.confirm(`Move "${p.name}" with its trades, cash and statements into ${firm.name}? It stops being a personal portfolio.`)) return
    setError('')
    try { await api.post(`/api/firms/${firm.id}/transfer`, { portfolio_id: move }); setMove(''); onChange() } catch (err) { setError(err.message) }
  }
  return (
    <>
      <Card title="Firm portfolios">
        {firm.portfolios.length === 0 ? <p className="muted">No portfolios yet.</p> : (
          <table className="data-table">
            <thead><tr><th>Portfolio</th><th>Type</th><th>Client</th><th /></tr></thead>
            <tbody>
              {firm.portfolios.map((p) => (
                <tr key={p.id}>
                  <td><strong>{p.name}</strong></td><td className="muted">{p.kind}</td><td>{p.client_name}</td>
                  <td><button type="button" className="btn btn-sm" onClick={() => { setCurrent(p.id); navigate('/portfolio') }}>Open</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {firm.portfolios.length > 1 && (
          <button type="button" className="btn btn-sm btn-ghost" style={{ marginTop: 8 }} onClick={() => { setCurrent(`firm:${firm.id}`); navigate('/portfolio') }}>
            View all {firm.name} portfolios combined
          </button>
        )}
      </Card>
      {canWrite && (
        <Card title="Add a portfolio" className="mt-1">
          <form onSubmit={create} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label style={field}>Name<input className="input" style={{ minWidth: 0 }} required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
            <label style={field}>Type
              <select className="input" style={{ minWidth: 0 }} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
                <option value="client">Client account</option><option value="model">Model portfolio</option><option value="personal">House account</option>
              </select>
            </label>
            <label style={field}>Client name<input className="input" style={{ minWidth: 0 }} value={f.client_name} onChange={(e) => setF({ ...f, client_name: e.target.value })} /></label>
            <button className="btn">Create</button>
          </form>
          {movable.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: '1rem' }}>
              <span className="muted" style={{ fontSize: '0.85rem' }}>Or move one of your personal portfolios in:</span>
              <select className="input" style={{ minWidth: 0, width: 220 }} value={move} onChange={(e) => setMove(e.target.value)} aria-label="Personal portfolio to move">
                <option value="">Choose…</option>
                {movable.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <button type="button" className="btn btn-sm btn-secondary" disabled={!move} onClick={transfer}>Move into firm</button>
            </div>
          )}
          {error && <p className="negative" role="alert">{error}</p>}
        </Card>
      )}
    </>
  )
}

function Members({ firm, me }) {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')
  const admin = firm.role === 'admin'
  const load = () => api.get(`/api/firms/${firm.id}/members`).then((r) => setRows(r.members)).catch((e) => setError(e.message))
  useEffect(() => { load() }, [firm.id])
  const act = async (fn) => { setError(''); try { setRows((await fn()).members) } catch (e) { setError(e.message) } }
  const lastReview = rows && rows.reduce((m, r) => (r.reviewed_at && (!m || r.reviewed_at < m) ? r.reviewed_at : m), null)
  return (
    <Card title="Members">
      {!rows ? <LoadingSpinner /> : (
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead><tr>{['Member', 'Role', 'Status', 'Last sign-in', 'Added', ''].map((h) => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.username}>
                  <td><strong>{m.username}</strong><div className="muted" style={{ fontSize: '0.75rem' }}>{m.name}</div></td>
                  <td>{admin ? (
                    <select className="input" style={{ minWidth: 0 }} aria-label={`Role of ${m.username}`} value={m.role}
                      onChange={(e) => act(() => api.put(`/api/firms/${firm.id}/members/${m.username}`, { role: e.target.value }))}>
                      {ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>) : ROLE_LABEL[m.role]}</td>
                  <td className={m.status === 'active' ? '' : 'negative'}>{m.status}</td>
                  <td className="muted">{when(m.last_login_at)}</td>
                  <td className="muted">{new Date(m.added_at).toLocaleDateString()} {m.added_by && m.added_by !== m.username ? `by ${m.added_by}` : ''}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {admin && m.username !== me && (
                      <>
                        <button type="button" className="btn btn-sm btn-ghost" onClick={() => act(() => api.put(`/api/firms/${firm.id}/members/${m.username}`, { status: m.status === 'active' ? 'suspended' : 'active' }))}>
                          {m.status === 'active' ? 'Suspend' : 'Reactivate'}
                        </button>
                        <button type="button" className="btn btn-sm btn-ghost" onClick={() => window.confirm(`Remove ${m.username} from ${firm.name}?`) && act(() => api.del(`/api/firms/${firm.id}/members/${m.username}`))}>Remove</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {admin && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 10 }}>
          <button type="button" className="btn btn-sm btn-secondary" onClick={() => act(() => api.post(`/api/firms/${firm.id}/access-review`, {}))}>
            Confirm access review
          </button>
          <span className="muted" style={{ fontSize: '0.8rem' }}>
            Check that every member still needs their access, then confirm. Last full review: {when(lastReview)}. Recorded in the audit trail.
          </span>
        </div>
      )}
      {error && <p className="negative" role="alert">{error}</p>}
    </Card>
  )
}

function Invites({ firm }) {
  const [rows, setRows] = useState([])
  const [role, setRole] = useState('viewer')
  const [email, setEmail] = useState('')
  const [link, setLink] = useState('')
  const [error, setError] = useState('')
  const load = () => api.get(`/api/firms/${firm.id}/invites`).then((r) => setRows(r.invites)).catch((e) => setError(e.message))
  useEffect(() => { load() }, [firm.id])
  const create = async (e) => {
    e.preventDefault(); setError('')
    try { const r = await api.post(`/api/firms/${firm.id}/invites`, { role, email }); setLink(r.link); setEmail(''); load() } catch (err) { setError(err.message) }
  }
  return (
    <Card title="Invitations">
      <form onSubmit={create} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label style={field}>Role
          <select className="input" style={{ minWidth: 0 }} value={role} onChange={(e) => setRole(e.target.value)}>
            {ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label style={field}>For (optional, for your records)<input className="input" style={{ minWidth: 0, width: 240 }} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" /></label>
        <button className="btn">Create invitation link</button>
      </form>
      {link && (
        <div style={{ marginTop: 10, padding: 10, border: '1px solid var(--border)', borderRadius: 8 }}>
          <div className="muted" style={{ fontSize: '0.8rem' }}>Send this link to the person (it works once and expires in 7 days; it won't be shown again):</div>
          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
            <input className="input" readOnly value={link} onFocus={(e) => e.target.select()} aria-label="Invitation link" />
            <button type="button" className="btn btn-sm" onClick={() => navigator.clipboard?.writeText(link)}>Copy</button>
          </div>
        </div>
      )}
      {rows.length > 0 && (
        <table className="data-table" style={{ marginTop: 10 }}>
          <thead><tr>{['Role', 'For', 'Created', 'Status', ''].map((h) => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{ROLE_LABEL[r.role]}</td><td className="muted">{r.email || '—'}</td>
                <td className="muted">{new Date(r.created_at).toLocaleDateString()} by {r.created_by}</td>
                <td>{r.status}{r.accepted_by ? ` (${r.accepted_by})` : ''}</td>
                <td>{r.status === 'pending' && <button type="button" className="btn btn-sm btn-ghost" onClick={async () => { await api.del(`/api/firms/${firm.id}/invites/${r.id}`); load() }}>Revoke</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {error && <p className="negative" role="alert">{error}</p>}
    </Card>
  )
}

function SignIn({ firm, onChange }) {
  const [p, setP] = useState({ sso_domains: firm.sso_domains.join(', '), sso_required: firm.sso_required, default_role: firm.default_role, session_hours: firm.session_hours, mfa_required: !!firm.mfa_required, idp_mfa: !!firm.idp_mfa })
  const [s, setS] = useState({ idp_entity_id: firm.saml?.idp_entity_id || '', idp_sso_url: firm.saml?.idp_sso_url || '', idp_cert: '', email_attribute: firm.saml?.email_attribute || '', enabled: firm.saml?.enabled ?? true })
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const savePolicy = async (e) => {
    e.preventDefault(); setError(''); setMsg('')
    try {
      await api.put(`/api/firms/${firm.id}`, { ...p, sso_domains: p.sso_domains.split(/[,\s]+/).filter(Boolean), session_hours: parseInt(p.session_hours, 10) })
      setMsg('Sign-in policy saved.'); onChange()
    } catch (err) { setError(err.message) }
  }
  const saveSaml = async (e) => {
    e.preventDefault(); setError(''); setMsg('')
    try { await api.put(`/api/firms/${firm.id}/saml`, s); setMsg('SAML settings saved.'); setS({ ...s, idp_cert: '' }); onChange() } catch (err) { setError(err.message) }
  }
  return (
    <>
      <Card title="Sign-in policy">
        <form onSubmit={savePolicy} style={{ display: 'grid', gap: 10, maxWidth: 640 }}>
          <label style={field}>Company email domains (people signing in with these are added automatically)
            <input className="input" value={p.sso_domains} onChange={(e) => setP({ ...p, sso_domains: e.target.value })} placeholder="example.com, example.co.uk" />
          </label>
          <label style={field}>New members from company sign-in start as
            <select className="input" value={p.default_role} onChange={(e) => setP({ ...p, default_role: e.target.value })}>
              {ROLES.filter(([v]) => v !== 'admin').map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label style={field}>Sessions end after (hours, 1–24)
            <input className="input" type="number" min="1" max="24" value={p.session_hours} onChange={(e) => setP({ ...p, session_hours: e.target.value })} />
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="checkbox" checked={p.sso_required} onChange={(e) => setP({ ...p, sso_required: e.target.checked })} />
            Require company sign-in for members (admins can still use their password, so you can't lock yourselves out)
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="checkbox" checked={p.mfa_required} onChange={(e) => setP({ ...p, mfa_required: e.target.checked })} />
            Require two-factor authentication for members (members without it must set up an authenticator app before they can continue; this includes admins)
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="checkbox" checked={p.idp_mfa} onChange={(e) => setP({ ...p, idp_mfa: e.target.checked })} />
            Our identity provider handles two-factor authentication (no extra code after company sign-in; only tick this if your SAML identity provider enforces MFA)
          </label>
          <div><button className="btn">Save policy</button></div>
        </form>
      </Card>
      <Card title="Company sign-in (SAML 2.0)" className="mt-1">
        <p className="muted" style={{ fontSize: '0.85rem', marginTop: 0 }}>
          In your identity provider (Okta, Microsoft Entra ID, Google Workspace, Ping…) create a SAML app with these values,
          then paste its details below. Members sign in from the login page with "Sign in with your company".
        </p>
        <div style={{ display: 'grid', gap: 4, fontSize: '0.85rem', marginBottom: 12 }}>
          <div><span className="muted">Entity ID / metadata URL:</span> <code>{firm.sp.entity_id}</code></div>
          <div><span className="muted">ACS (reply) URL:</span> <code>{firm.sp.acs_url}</code></div>
          <div><span className="muted">Name ID:</span> email address</div>
        </div>
        <form onSubmit={saveSaml} style={{ display: 'grid', gap: 10, maxWidth: 640 }}>
          <label style={field}>Identity provider entity ID (issuer)<input className="input" required value={s.idp_entity_id} onChange={(e) => setS({ ...s, idp_entity_id: e.target.value })} /></label>
          <label style={field}>Identity provider sign-in URL<input className="input" required type="url" value={s.idp_sso_url} onChange={(e) => setS({ ...s, idp_sso_url: e.target.value })} placeholder="https://…" /></label>
          <label style={field}>Signing certificate (PEM){firm.saml?.has_cert ? ' (saved; paste a new one to replace it)' : ''}
            <textarea className="input" rows={5} required={!firm.saml?.has_cert} value={s.idp_cert} onChange={(e) => setS({ ...s, idp_cert: e.target.value })} placeholder="-----BEGIN CERTIFICATE-----" />
          </label>
          <label style={field}>Email attribute name (optional; otherwise the Name ID is used)<input className="input" value={s.email_attribute} onChange={(e) => setS({ ...s, email_attribute: e.target.value })} /></label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={s.enabled} onChange={(e) => setS({ ...s, enabled: e.target.checked })} /> Enabled</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn" disabled={firm.saml?.has_cert && !s.idp_cert}>Save SAML settings</button>
            {firm.saml?.has_cert && <a className="btn btn-secondary" href={`/api/sso/saml/${firm.slug}/start?intent=link&next=/firm/${firm.id}`}>Test: link my company sign-in</a>}
          </div>
          {firm.saml?.has_cert && <span className="muted" style={{ fontSize: '0.8rem' }}>To change other fields, paste the certificate again.</span>}
        </form>
      </Card>
      {msg && <p className="positive">{msg}</p>}
      {error && <p className="negative" role="alert">{error}</p>}
    </>
  )
}

function Audit({ firm }) {
  const [rows, setRows] = useState(null)
  const [filter, setFilter] = useState({ action: '', actor: '', since: '' })
  const [error, setError] = useState('')
  const load = (before) => {
    const q = new URLSearchParams(Object.entries({ ...filter, before_id: before || '' }).filter(([, v]) => v))
    api.get(`/api/firms/${firm.id}/audit?${q}`).then((r) => setRows(before ? [...rows, ...r.events] : r.events)).catch((e) => setError(e.message))
  }
  useEffect(() => { load() }, [firm.id])
  const download = async () => {
    const q = filter.since ? `?since=${filter.since}` : ''
    const res = await fetch(`/api/firms/${firm.id}/audit.csv${q}`, { credentials: 'include' })
    if (!res.ok) { setError('Export failed'); return }
    const url = URL.createObjectURL(await res.blob())
    const a = document.createElement('a'); a.href = url; a.download = `${firm.slug}-audit.csv`; document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 5000)
  }
  return (
    <Card title="Audit trail">
      <p className="muted" style={{ fontSize: '0.85rem', marginTop: 0 }}>
        Every sign-in-policy, membership, portfolio, trade and cash change in this firm. Entries can't be edited or deleted,
        and each one is chained to the previous by a hash so tampering is detectable.
      </p>
      <form onSubmit={(e) => { e.preventDefault(); load() }} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 10 }}>
        <label style={field}>Action<input className="input" style={{ minWidth: 0, width: 170 }} value={filter.action} onChange={(e) => setFilter({ ...filter, action: e.target.value })} placeholder="e.g. trade.add" /></label>
        <label style={field}>Person<input className="input" style={{ minWidth: 0, width: 140 }} value={filter.actor} onChange={(e) => setFilter({ ...filter, actor: e.target.value })} /></label>
        <label style={field}>Since<input className="input" style={{ minWidth: 0 }} type="date" value={filter.since} onChange={(e) => setFilter({ ...filter, since: e.target.value })} /></label>
        <button className="btn btn-sm">Filter</button>
        <button type="button" className="btn btn-sm btn-secondary" onClick={download}>Export CSV</button>
      </form>
      {!rows ? <LoadingSpinner /> : rows.length === 0 ? <p className="muted">No events.</p> : (
        <div style={{ overflowX: 'auto', maxHeight: 520, overflowY: 'auto' }}>
          <table className="data-table">
            <thead><tr>{['Time', 'Person', 'Action', 'On', 'From', 'Details'].map((h) => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="muted" style={{ whiteSpace: 'nowrap' }}>{when(r.at)}</td><td>{r.actor}</td><td><code>{r.action}</code></td>
                  <td className="muted">{r.target || ''}</td><td className="muted">{r.ip || ''}</td>
                  <td className="muted" style={{ fontSize: '0.75rem', maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis' }} title={JSON.stringify(r.detail)}>{JSON.stringify(r.detail)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows && rows.length >= 200 && rows.length % 200 === 0 && <button type="button" className="btn btn-sm btn-ghost" onClick={() => load(rows[rows.length - 1].id)}>Older</button>}
      {error && <p className="negative" role="alert">{error}</p>}
    </Card>
  )
}

function Danger({ firm }) {
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const { refresh, setCurrent } = usePortfolios()
  const navigate = useNavigate()
  const del = async () => {
    setError('')
    try { await api.post(`/api/firms/${firm.id}/delete`, { confirm_name: confirm }); setCurrent('all'); await refresh(); navigate('/firms') } catch (e) { setError(e.message) }
  }
  return (
    <Card title="Delete firm">
      <p className="muted" style={{ marginTop: 0 }}>Deletes the firm, all its portfolios, trades, cash records and statements. Members keep their personal accounts. This can't be undone.</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input className="input" style={{ minWidth: 0, width: 260 }} aria-label="Type the firm name to confirm" placeholder={`Type "${firm.name}"`} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        <button type="button" className="btn btn-danger" disabled={confirm !== firm.name} onClick={del}>Delete {firm.name}</button>
      </div>
      {error && <p className="negative" role="alert">{error}</p>}
    </Card>
  )
}

export default function Firm() {
  const { firmId } = useParams()
  const [firm, setFirm] = useState(null)
  const [tab, setTab] = useState('portfolios')
  const [error, setError] = useState('')
  const { refresh } = usePortfolios()
  const me = (() => { try { return JSON.parse(localStorage.getItem('user'))?.username } catch { return '' } })()

  const load = async () => {
    try {
      const [f, list] = await Promise.all([api.get(`/api/firms/${firmId}`), api.get('/api/firms/')])
      setFirm({ ...f, portfolios: list.firms.find((x) => x.id === firmId)?.portfolios || [] })
    } catch (e) { setError(e.message) }
  }
  useEffect(() => { load() }, [firmId])
  const changed = () => { load(); refresh() }

  if (error) return <Card><p className="negative" style={{ margin: 0 }}>{error}</p></Card>
  if (!firm) return <LoadingSpinner />
  const tabs = [['portfolios', 'Portfolios'], ['members', 'Members'],
    ...(firm.role === 'admin' ? [['invites', 'Invitations'], ['signin', 'Sign-in & SSO']] : []),
    ...(['admin', 'compliance'].includes(firm.role) ? [['audit', 'Audit trail']] : []),
    ...(firm.role === 'admin' ? [['danger', 'Delete']] : [])]
  return (
    <div>
      <h1 style={{ marginTop: 0 }}>{firm.name} <span className="muted" style={{ fontSize: '1rem', fontWeight: 400 }}>· you are {ROLE_LABEL[firm.role]}</span></h1>
      <div role="tablist" aria-label="Firm sections" style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: '1rem' }}>
        {tabs.map(([v, l]) => (
          <button key={v} type="button" role="tab" aria-selected={tab === v} className={`btn btn-sm ${tab === v ? '' : 'btn-ghost'}`} onClick={() => setTab(v)}>{l}</button>
        ))}
      </div>
      {tab === 'portfolios' && <Portfolios firm={firm} onChange={changed} />}
      {tab === 'members' && <Members firm={firm} me={me} />}
      {tab === 'invites' && <Invites firm={firm} />}
      {tab === 'signin' && <SignIn firm={firm} onChange={load} />}
      {tab === 'audit' && <Audit firm={firm} />}
      {tab === 'danger' && <Danger firm={firm} />}
    </div>
  )
}
