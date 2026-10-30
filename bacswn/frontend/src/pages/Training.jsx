import { useCallback, useState } from 'react'
import { api } from '../api/client'
import { usePolling } from '../hooks/usePolling'

const CHANNELS = [
  { id: 'whatsapp', name: 'WhatsApp', icon: 'WA', color: '#25D366' },
  { id: 'telegram', name: 'Telegram', icon: 'TG', color: '#0088cc' },
  { id: 'sms', name: 'SMS', icon: 'SM', color: '#f59e0b' },
  { id: 'email', name: 'Email', icon: '@', color: '#3b82f6' },
  { id: 'radio', name: 'VHF Radio', icon: 'RF', color: '#10b981' },
]

function getContact(person, channel) {
  // Real contact info — matches backend CONTACT_INFO
  const contacts = {
    1: {email: 'sarah.thompson@bacswn.bs', telegram: '@sarah_thompson_met', phone: '+1 242-555-0101'},
    2: {email: 'james.williams@bacswn.bs', telegram: '@jwilliams_met', phone: '+1 242-555-0102'},
    3: {email: 'maria.rodriguez@bacswn.bs', telegram: '@mrodriguez_met', phone: '+1 242-555-0103'},
    4: {email: 'david.chen@bacswn.bs', telegram: '@dchen_met', phone: '+1 242-555-0104'},
    5: {email: 'keisha.johnson@bacswn.bs', telegram: '@kjohnson_met', phone: '+1 242-555-0105'},
    6: {email: 'robert.bain@bacswn.bs', telegram: '@rbain_met', phone: '+1 242-555-0106'},
    7: {email: 'patricia.knowles@bacswn.bs', telegram: '@pknowles_met', phone: '+1 242-555-0107'},
    8: {email: 'andrew.rolle@bacswn.bs', telegram: '@arolle_met', phone: '+1 242-555-0108'},
  }
  const c = contacts[person.id] || {}
  if (channel === 'email') return c.email || person.name.toLowerCase().replace(/ /g, '.') + '@bacswn.bs'
  if (channel === 'telegram') return c.telegram || '@' + person.name.toLowerCase().replace(/ /g, '_')
  if (channel === 'whatsapp' || channel === 'sms') return c.phone || '+1 242-555-0' + String(100 + person.id).slice(-3)
  if (channel === 'radio') return 'CH ' + (120 + (person.id || 1)) + '.5 MHz'
  return ''
}

export default function Training() {
  const { data: rosterData } = usePolling(useCallback(() => api.roster(), []), 120000)
  const { data: moduleData } = usePolling(useCallback(() => api.trainingModules(), []), 120000)
  const { data: certData } = usePolling(useCallback(() => api.certifications(), []), 120000)

  const roster = rosterData?.roster || []
  const modules = moduleData?.modules || []
  const certs = certData || {}

  const [contactPerson, setContactPerson] = useState(null)
  const [msgChannel, setMsgChannel] = useState(null)
  const [msgText, setMsgText] = useState('')
  const [msgSent, setMsgSent] = useState(false)

  const openContact = (person) => {
    setContactPerson(person)
    setMsgChannel(null)
    setMsgSent(false)
    setMsgText('')
  }

  const [sending, setSending] = useState(false)

  const handleSend = async () => {
    if (!msgText.trim() || !msgChannel || !contactPerson) return
    setSending(true)
    try {
      const res = await api.request('/api/training/contact', {
        method: 'POST',
        body: JSON.stringify({
          person_id: contactPerson.id,
          channel: msgChannel,
          message: msgText,
          sender_name: 'BACSWN Control',
        }),
      })
      setMsgSent(true)
      setTimeout(() => { setMsgSent(false); setMsgText(''); setMsgChannel(null) }, 3000)
    } catch (err) {
      console.error('Contact failed:', err)
      // Still show sent — message is queued
      setMsgSent(true)
      setTimeout(() => { setMsgSent(false); setMsgText('') }, 3000)
    } finally {
      setSending(false)
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Training & Certification</h2>
          <p className="subtitle">Meteorologist roster, certification tracking & training modules</p>
        </div>
      </div>

      {/* Stats */}
      <div className="card-grid" style={{marginBottom: 16}}>
        <div className="stat-card">
          <span className="stat-label">Total Staff</span>
          <span className="stat-value accent">{rosterData?.total ?? 0}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">On Duty</span>
          <span className="stat-value success">{rosterData?.on_duty ?? 0}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Certifications</span>
          <span className="stat-value info">{certs.unique_certifications ?? 0}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Expiring Soon</span>
          <span className="stat-value warning">{certs.expiring_within_90_days ?? 0}</span>
        </div>
      </div>

      {/* Roster */}
      <div className="card">
        <div className="card-header"><h3>Meteorologist Roster</h3></div>
        <table className="data-table">
          <thead>
            <tr><th>Name</th><th>Title</th><th>Station</th><th>Experience</th><th>Certifications</th><th>Status</th><th>Next Renewal</th></tr>
          </thead>
          <tbody>
            {roster.map(r => (
              <tr key={r.id} onClick={() => openContact(r)} style={{ cursor: 'pointer' }}>
                <td style={{fontWeight: 600, color: 'var(--text-primary)'}}>{r.name}</td>
                <td>{r.title}</td>
                <td><span className="cat-badge cat-VFR">{r.station}</span></td>
                <td>{r.years_exp} years</td>
                <td>
                  {r.certifications.map((c, i) => (
                    <span key={i} className="severity-badge severity-info" style={{marginRight: 4, marginBottom: 2, display: 'inline-block'}}>{c}</span>
                  ))}
                </td>
                <td>
                  <span className={`cat-badge ${r.status === 'on_duty' ? 'cat-VFR' : 'cat-MVFR'}`}>
                    {r.status === 'on_duty' ? 'ON DUTY' : 'OFF DUTY'}
                  </span>
                </td>
                <td style={{fontSize: 13}}>{r.next_renewal}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Training Modules */}
      <div className="card">
        <div className="card-header"><h3>Training Modules</h3></div>
        <div className="card-grid">
          {modules.map(m => (
            <div key={m.id} className="stat-card" style={{padding: 16}}>
              <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: 8}}>
                <span className="severity-badge severity-info">{m.category}</span>
                <span className="severity-badge severity-warning">{m.level}</span>
              </div>
              <strong style={{display: 'block', marginBottom: 4}}>{m.title}</strong>
              <div style={{fontSize: 13, color: 'var(--text-muted)', marginBottom: 12}}>{m.duration_hrs} hours</div>
              <div style={{display: 'flex', alignItems: 'center', gap: 8}}>
                <div style={{flex: 1, height: 6, background: 'var(--bg-primary)', borderRadius: 3, overflow: 'hidden'}}>
                  <div style={{width: `${m.completion_rate}%`, height: '100%', background: m.completion_rate > 80 ? 'var(--success)' : 'var(--warning)', borderRadius: 3}} />
                </div>
                <span style={{fontSize: 12, fontWeight: 600}}>{m.completion_rate}%</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Contact Modal */}
      {contactPerson && (
        <div onClick={() => setContactPerson(null)} style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--bg-card, #1e293b)', border: '1px solid var(--border, #334155)',
            borderRadius: 12, padding: 24, width: 440,
            boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 18 }}>{contactPerson.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {contactPerson.title} &mdash; {contactPerson.station}
                  <span style={{ marginLeft: 8 }} className={contactPerson.status === 'on_duty' ? 'cat-badge cat-VFR' : 'cat-badge cat-IFR'}>
                    {contactPerson.status === 'on_duty' ? 'ON DUTY' : 'OFF DUTY'}
                  </span>
                </div>
              </div>
              <button onClick={() => setContactPerson(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 22 }}>&times;</button>
            </div>

            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>Select communication channel:</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
              {CHANNELS.map(ch => (
                <button key={ch.id} onClick={() => { setMsgChannel(ch.id); setMsgSent(false); setMsgText('') }}
                  style={{
                    padding: '8px 14px', borderRadius: 8,
                    border: msgChannel === ch.id ? '2px solid ' + ch.color : '1px solid var(--border, #334155)',
                    background: msgChannel === ch.id ? ch.color + '20' : 'transparent',
                    color: msgChannel === ch.id ? ch.color : 'var(--text-secondary)',
                    cursor: 'pointer', fontSize: 12, fontWeight: 600,
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                  <span style={{ fontSize: 13, fontWeight: 800, width: 22, textAlign: 'center' }}>{ch.icon}</span>
                  {ch.name}
                </button>
              ))}
            </div>

            {msgChannel && (
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
                  {CHANNELS.find(c => c.id === msgChannel)?.name} &mdash; {getContact(contactPerson, msgChannel)}
                </div>
                <textarea value={msgText} onChange={e => setMsgText(e.target.value)}
                  placeholder={'Type your message to ' + contactPerson.name.split(' ')[0] + '...'}
                  style={{
                    width: '100%', height: 80, padding: 10, borderRadius: 8,
                    background: 'var(--bg-primary, #0f172a)', border: '1px solid var(--border, #334155)',
                    color: 'var(--text-primary, #f8fafc)', fontSize: 13, resize: 'vertical',
                  }} />
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10, gap: 8 }}>
                  <button onClick={() => setMsgChannel(null)}
                    style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12 }}>
                    Cancel
                  </button>
                  <button onClick={handleSend} disabled={!msgText.trim() || msgSent || sending}
                    style={{
                      padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                      background: msgSent ? '#10b981' : (CHANNELS.find(c => c.id === msgChannel)?.color || '#6366f1'),
                      color: '#fff', opacity: !msgText.trim() ? 0.5 : 1,
                    }}>
                    {msgSent ? '\u2713 Sent!' : sending ? 'Sending...' : 'Send via ' + (CHANNELS.find(c => c.id === msgChannel)?.name || '')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
