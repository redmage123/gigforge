import { useCallback } from 'react'
import { api } from '../api/client'
import { usePolling } from '../hooks/usePolling'

export default function Training() {
  const { data: rosterData } = usePolling(useCallback(() => api.roster(), []), 120000)
  const { data: moduleData } = usePolling(useCallback(() => api.trainingModules(), []), 120000)
  const { data: certData } = usePolling(useCallback(() => api.certifications(), []), 120000)

  const roster = rosterData?.roster || []
  const modules = moduleData?.modules || []
  const certs = certData || {}

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
              <tr key={r.id}>
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
    </div>
  )
}
