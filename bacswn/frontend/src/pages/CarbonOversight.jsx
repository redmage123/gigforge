import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { api } from '../api/client'
import { useAuth } from '../App'
import './CarbonOversight.css'

/**
 * CORSIA oversight register. Under CORSIA, airlines buy and cancel the units;
 * the state verifies their emissions reports and cancellation claims. Evidence
 * is append-only: revisions add rows, reviews add decisions.
 */

const STATUS = {
  COVERED: ['Covered', 'ok'],
  AWAITING_REVIEW: ['Awaiting review', 'warn'],
  SHORTFALL: ['Shortfall', 'bad'],
  NO_REPORTS: ['No reports', 'muted'],
}
const CLAIM_STATUS = {
  PENDING: ['Pending', 'warn'], REOPENED: ['Reopened', 'warn'], VERIFIED: ['Verified', 'ok'], REJECTED: ['Rejected', 'bad'],
}
const SEVERITY = { high: ['High', 'bad'], medium: ['Medium', 'warn'], low: ['Low', 'muted'] }
const KIND = {
  SHORTFALL: 'Shortfall', MISSING_REPORT: 'Missing report', DOUBLE_CLAIM: 'Units claimed twice',
  INELIGIBLE_UNIT: 'Ineligible units', VINTAGE_OUTSIDE_WINDOW: 'Vintage outside window', BELOW_OBSERVED: 'Below BACSWN observation',
}
const n = (v) => (v == null ? '—' : Number(v).toLocaleString())
const today = () => new Date().toISOString().slice(0, 10)

const Badge = ({ map, value }) => {
  const [label, tone] = map[value] || [value, 'muted']
  return <span className={`co-badge ${tone}`}>{label}</span>
}

/** Labelled input with hint and error wired up for assistive tech. */
function Field({ label, name, hint, required, error, as = 'input', children, ...props }) {
  const id = useId()
  const hintId = hint ? `${id}-hint` : undefined
  const errId = error ? `${id}-err` : undefined
  const Tag = as
  return (
    <div className="co-field">
      <label htmlFor={id}>{label}{required && <span aria-hidden="true"> *</span>}</label>
      <Tag id={id} name={name} required={required} aria-invalid={error ? true : undefined}
        aria-describedby={[hintId, errId].filter(Boolean).join(' ') || undefined} {...props}>{children}</Tag>
      {hint && <small id={hintId} className="co-hint">{hint}</small>}
      {error && <small id={errId} className="co-field-err">{error}</small>}
    </div>
  )
}

/** Form shell: native validation, server error announced, focus kept sensible. */
function ApiForm({ title, submitLabel, onSubmit, onDone, children, className = '' }) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const errRef = useRef(null)
  const submit = async (e) => {
    e.preventDefault()
    const form = e.currentTarget
    const data = Object.fromEntries(new FormData(form).entries())
    for (const el of form.querySelectorAll('input[type=checkbox]')) data[el.name] = el.checked
    setBusy(true); setError('')
    try {
      const result = await onSubmit(data)
      form.reset()
      onDone?.(result)
    } catch (err) {
      setError(err.message)
      requestAnimationFrame(() => errRef.current?.focus())
    } finally { setBusy(false) }
  }
  return (
    <form className={`co-form ${className}`} onSubmit={submit} aria-label={title} noValidate={false}>
      <div className="co-form-grid">{children}</div>
      <div ref={errRef} tabIndex={-1} role="alert" className="co-form-error">{error}</div>
      <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>{busy ? 'Saving…' : submitLabel}</button>
    </form>
  )
}

/** Modal review dialog (native <dialog>: focus trap + Esc built in). */
function ReviewDialog({ claim, onClose, onReviewed }) {
  const ref = useRef(null)
  const allowed = claim && (['VERIFIED', 'REJECTED'].includes(claim.status) ? ['REOPENED'] : ['VERIFIED', 'REJECTED'])
  useEffect(() => {
    const d = ref.current
    if (claim && d && !d.open) d.showModal()
    if (!claim && d?.open) d.close()
  }, [claim])
  if (!claim) return <dialog ref={ref} className="co-dialog" />
  return (
    <dialog ref={ref} className="co-dialog" aria-labelledby="co-review-h" onClose={onClose}>
      <h3 id="co-review-h">Review claim #{claim.id}</h3>
      <p className="co-dim">
        {claim.icao_designator} · {n(claim.quantity)} units · {claim.registry} {claim.serial_block}
        {claim.serial_start != null && ` ${claim.serial_start}–${claim.serial_end}`} · vintage {claim.vintage} ·
        currently <Badge map={CLAIM_STATUS} value={claim.status} />
      </p>
      <ApiForm title={`Review claim ${claim.id}`} submitLabel="Record decision"
        onSubmit={(d) => api.oversightReview(claim.id, d)} onDone={(r) => onReviewed(r)}>
        <fieldset className="co-radios">
          <legend>Decision</legend>
          {allowed.map((d, i) => (
            <label key={d}><input type="radio" name="decision" value={d} required defaultChecked={i === 0} />
              {{ VERIFIED: 'Verified — units confirmed cancelled in the registry', REJECTED: 'Rejected', REOPENED: 'Reopen for review' }[d]}</label>
          ))}
        </fieldset>
        <Field as="textarea" label="Reason" name="reason" rows={3} maxLength={1000}
          hint="Required to reject or reopen. Recorded permanently with your name." />
      </ApiForm>
      <button type="button" className="toggle-btn co-dialog-close" onClick={() => ref.current?.close()}>Cancel</button>
    </dialog>
  )
}

function OperatorDetail({ operatorId, period, row, isAdmin, onChanged, onReview, announce }) {
  const [detail, setDetail] = useState(null)
  const headingRef = useRef(null)
  const focused = useRef(false)
  const load = useCallback(() => api.oversightOperator(operatorId).then(setDetail).catch(() => setDetail(null)), [operatorId])
  useEffect(() => { load() }, [load])
  // Move focus to the section once its heading exists (first load only, not on refreshes).
  useEffect(() => {
    if (detail && !focused.current) { focused.current = true; headingRef.current?.focus() }
  }, [detail])
  const refresh = (msg) => { announce(msg); load(); onChanged() }
  if (!detail) return <section className="card" aria-busy="true"><p>Loading operator…</p></section>
  const op = detail.operator
  const claims = detail.claims.filter(c => c.compliance_period === period)
  return (
    <section className="card co-detail" aria-labelledby="co-detail-h">
      <h3 id="co-detail-h" tabIndex={-1} ref={headingRef}>{op.icao_designator} — {op.name}</h3>

      <h4>Emissions and requirement, {period}</h4>
      <div className="table-scroll" role="region" aria-label={`${op.icao_designator} emissions by year`} tabIndex={0}>
        <table className="data-table co-table">
          <thead><tr>
            <th scope="col">Year</th><th scope="col">Verified CO₂ (t)</th><th scope="col">Growth factor</th>
            <th scope="col">Requirement (units)</th><th scope="col">BACSWN observed in FIR (t)</th><th scope="col">Report</th>
          </tr></thead>
          <tbody>
            {row?.years.map(y => (
              <tr key={y.year}>
                <th scope="row">{y.year}</th>
                <td className="num">{y.report ? n(y.report.verified_co2_t) : <span className="co-dim">Not reported</span>}</td>
                <td className="num">{y.report ? y.report.growth_factor : '—'}</td>
                <td className="num">{n(y.offsetting_requirement_t)}</td>
                <td className="num">
                  {y.observed_live_co2_t != null ? n(y.observed_live_co2_t) : '—'}
                  {y.observed_simulated_co2_t ? <small className="co-dim"> (+{n(y.observed_simulated_co2_t)} simulated, excluded)</small> : null}
                </td>
                <td>{y.report ? <>rev {y.report.revision}{y.report.reference && ` · ${y.report.reference}`}{y.report.verifier && ` · ${y.report.verifier}`}</> : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="co-note">
        BACSWN-observed CO₂ covers only time inside the Bahamas FIR, estimated from aircraft category, so a verified
        report should always be higher. Data from the simulated fallback feed is shown but never used as evidence.
      </p>

      <h4>Cancellation claims, {period}</h4>
      {claims.length === 0 ? <p className="co-dim">No claims recorded for this period.</p> : (
        <div className="table-scroll" role="region" aria-label={`${op.icao_designator} cancellation claims`} tabIndex={0}>
          <table className="data-table co-table">
            <thead><tr>
              <th scope="col">Claim</th><th scope="col">Units</th><th scope="col">Registry / serials</th><th scope="col">Vintage</th>
              <th scope="col">Project</th><th scope="col">Cancelled</th><th scope="col">Status</th><th scope="col">Review history</th>
              {isAdmin && <th scope="col"><span className="sr-only">Actions</span></th>}
            </tr></thead>
            <tbody>
              {claims.map(c => (
                <tr key={c.id} id={`co-claim-${c.id}`}>
                  <th scope="row">#{c.id}</th>
                  <td className="num">{n(c.quantity)}</td>
                  <td>{c.registry} {c.serial_block}{c.serial_start != null && <> {c.serial_start}–{c.serial_end}</>}
                    {c.registry_reference && <small className="co-dim"><br />ref {c.registry_reference}</small>}</td>
                  <td>{c.vintage}{!c.declared_eligible && <><br /><span className="co-badge bad">Not CORSIA-eligible</span></>}</td>
                  <td>{c.project_name || c.project_id || '—'}</td>
                  <td>{c.cancelled_on}</td>
                  <td><Badge map={CLAIM_STATUS} value={c.status} /></td>
                  <td>{c.reviews.length === 0 ? <span className="co-dim">None</span> : (
                    <ol className="co-history">{c.reviews.map((r, i) => (
                      <li key={i}><b>{CLAIM_STATUS[r.decision]?.[0] || r.decision}</b> by {r.created_by}, {r.created_at.slice(0, 10)}{r.reason && ` — ${r.reason}`}</li>
                    ))}</ol>
                  )}</td>
                  {isAdmin && <td><button type="button" className="toggle-btn" onClick={() => onReview(c, () => refresh(`Claim ${c.id} reviewed`))}
                    aria-label={`Review claim ${c.id}`}>Review</button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {isAdmin && (
        <div className="co-forms">
          <details>
            <summary>Record a verified emissions report</summary>
            <ApiForm title="Record emissions report" submitLabel="Record report"
              onSubmit={(d) => api.oversightAddReport(op.id, d)}
              onDone={(r) => refresh(`Report recorded for ${r.year}, revision ${r.revision}. Requirement ${n(r.offsetting_requirement_t)} units.`)}>
              <Field label="Year" name="year" type="number" required min={2019} max={new Date().getFullYear()} inputMode="numeric" />
              <Field label="Verified CO₂ (tonnes)" name="verified_co2_t" type="number" required min={0} step={1} inputMode="numeric" />
              <Field label="Growth factor" name="growth_factor" type="number" required min={0} max={1} step="any"
                hint="The sector growth factor ICAO published for that year (0–1)." />
              <Field label="Verification body" name="verifier" maxLength={120} />
              <Field label="Report reference" name="reference" maxLength={120} />
            </ApiForm>
            <p className="co-note">A second report for the same year supersedes the first; both stay on record.</p>
          </details>
          <details>
            <summary>Record a unit cancellation claim</summary>
            <ApiForm title="Record cancellation claim" submitLabel="Record claim"
              onSubmit={(d) => api.oversightAddClaim(op.id, { ...d, compliance_period: period })}
              onDone={(r) => refresh(`Claim ${r.id} recorded as pending review.`)}>
              <Field label="Registry" name="registry" required maxLength={80} list="co-registries" hint="Programme that issued and cancelled the units." />
              <Field label="Quantity (units)" name="quantity" type="number" required min={1} step={1} inputMode="numeric" />
              <Field label="Vintage" name="vintage" type="number" required min={2000} max={new Date().getFullYear()} inputMode="numeric" />
              <Field label="Serial block" name="serial_block" maxLength={200} hint="Prefix shared by the serial numbers." />
              <Field label="Serial start" name="serial_start" type="number" min={0} step={1} inputMode="numeric" />
              <Field label="Serial end" name="serial_end" type="number" min={0} step={1} inputMode="numeric"
                hint="If given, end − start + 1 must equal the quantity." />
              <Field label="Project ID" name="project_id" maxLength={80} />
              <Field label="Project name" name="project_name" maxLength={200} />
              <Field label="Cancellation date" name="cancelled_on" type="date" required max={today()} />
              <Field label="Registry cancellation reference" name="registry_reference" maxLength={120} />
              <div className="co-field co-check">
                <label><input type="checkbox" name="declared_eligible" defaultChecked /> Operator declares the units CORSIA-eligible</label>
              </div>
            </ApiForm>
          </details>
        </div>
      )}
    </section>
  )
}

export default function CarbonOversight() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [periods, setPeriods] = useState([])
  const [period, setPeriod] = useState('')
  const [reg, setReg] = useState(null)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState(null)
  const [reviewing, setReviewing] = useState(null)
  const [message, setMessage] = useState('')
  const reviewReturn = useRef(null)

  useEffect(() => {
    api.oversightPeriods().then(d => {
      setPeriods(d.periods)
      setPeriod((d.periods.find(p => p.current) || d.periods[0])?.id || '')
    }).catch(e => setError(e.message))
  }, [])
  const load = useCallback(() => {
    if (!period) return
    api.oversightRegister(period).then(d => { setReg(d); setError('') }).catch(e => setError(e.message))
  }, [period])
  useEffect(() => { load() }, [load])

  const announce = (msg) => { setMessage(''); requestAnimationFrame(() => setMessage(msg)) }
  const openReview = (claim, after) => {
    reviewReturn.current = { el: document.activeElement, after }
    setReviewing(claim)
  }
  const closeReview = () => {
    setReviewing(null)
    reviewReturn.current?.el?.focus?.()
  }
  const exportCsv = async () => {
    try {
      const blob = await api.oversightCsv(period)
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `corsia-claims-${period}.csv` })
      a.click(); URL.revokeObjectURL(a.href)
      announce('Claims register downloaded as CSV')
    } catch (e) { announce(e.message) }
  }
  const showClaim = (f) => {
    setSelected(f.operator_id)
    if (f.claim_id) setTimeout(() => document.getElementById(`co-claim-${f.claim_id}`)?.scrollIntoView({ block: 'center' }), 400)
  }

  const t = reg?.totals
  const high = reg?.findings.filter(f => f.severity === 'high').length ?? 0
  const selRow = reg?.operators.find(o => o.id === selected)

  return (
    <div className="co-page">
      <div className="page-header">
        <div>
          <h2>CORSIA Oversight Register</h2>
          <p className="subtitle">Aircraft operators attributed to the Bahamas — verified emissions, cancelled units, findings</p>
        </div>
        <div className="co-head-actions">
          <label className="co-period">Compliance period
            <select value={period} onChange={e => { setPeriod(e.target.value); setSelected(null) }}>
              {periods.map(p => <option key={p.id} value={p.id}>{p.id} · {p.label}{p.current ? ' (current)' : ''}</option>)}
            </select>
          </label>
          <button type="button" className="toggle-btn" onClick={exportCsv} disabled={!reg}>Export claims (CSV)</button>
        </div>
      </div>
      <div className="sr-only" role="status" aria-live="polite">{message}</div>
      {error && <p role="alert" className="co-form-error">{error}</p>}

      <p className="co-intro">
        Airlines buy and cancel CORSIA-eligible units in a registry. This register records what each operator reports and
        the state’s review of every claim. Entries are never edited or deleted: a revised report supersedes the earlier one,
        and each review decision is added to the claim’s history.
        {!isAdmin && ' You have read-only access; administrators record evidence and review claims.'}
      </p>

      {reg && (
        <>
          <div className="card-grid co-stats">
            <div className="stat-card"><span className="stat-label">Offsetting requirement</span>
              <span className="stat-value">{n(t.offsetting_requirement_t)}</span><span className="stat-detail">units, from verified reports</span></div>
            <div className="stat-card"><span className="stat-label">Verified cancelled</span>
              <span className="stat-value success">{n(t.verified_units)}</span><span className="stat-detail">units confirmed by review</span></div>
            <div className="stat-card"><span className="stat-label">Awaiting review</span>
              <span className="stat-value warning">{n(t.pending_units)}</span><span className="stat-detail">units claimed, not yet reviewed</span></div>
            <div className="stat-card"><span className="stat-label">Shortfall</span>
              <span className={`stat-value ${t.shortfall_units ? 'danger' : 'success'}`}>{n(t.shortfall_units)}</span>
              <span className="stat-detail">{reg.period_closed ? 'period closed' : 'so far this period'}</span></div>
          </div>

          <section className="card" aria-labelledby="co-findings-h">
            <div className="card-header">
              <h3 id="co-findings-h">Findings <span className="co-dim co-count">{reg.findings.length} total, {high} high</span></h3>
            </div>
            {reg.findings.length === 0 ? <p className="co-dim">No findings for this period.</p> : (
              <ul className="co-findings">
                {reg.findings.map((f, i) => (
                  <li key={i} className={`sev-${f.severity}`}>
                    <Badge map={SEVERITY} value={f.severity} />
                    <span><b>{f.operator}</b> · {KIND[f.kind] || f.kind}: {f.message}</span>
                    <button type="button" className="toggle-btn" onClick={() => showClaim(f)}
                      aria-label={`Open ${f.operator}${f.claim_id ? `, claim ${f.claim_id}` : ''}`}>Open</button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card" aria-labelledby="co-ops-h">
            <div className="card-header"><h3 id="co-ops-h">Operators</h3></div>
            {reg.operators.length === 0 ? <p className="co-dim">No operators registered yet.</p> : (
              <div className="table-scroll" role="region" aria-labelledby="co-ops-h" tabIndex={0}>
                <table className="data-table co-table">
                  <thead><tr>
                    <th scope="col">Operator</th><th scope="col">Reports</th><th scope="col">Requirement</th><th scope="col">Verified</th>
                    <th scope="col">Pending</th><th scope="col">Shortfall</th><th scope="col">Status</th>
                  </tr></thead>
                  <tbody>
                    {reg.operators.map(o => (
                      <tr key={o.id} aria-current={o.id === selected ? 'true' : undefined} className={o.id === selected ? 'co-selected' : ''}>
                        <th scope="row">
                          <button type="button" className="co-link" onClick={() => setSelected(o.id)} aria-expanded={o.id === selected}>
                            {o.icao_designator}</button> <span className="co-dim">{o.name}</span>
                        </th>
                        <td>{o.reported_years} of {o.years.length}</td>
                        <td className="num">{n(o.offsetting_requirement_t)}</td>
                        <td className="num">{n(o.verified_units)}</td>
                        <td className="num">{n(o.pending_units)}</td>
                        <td className="num">{n(o.shortfall_units)}</td>
                        <td><Badge map={STATUS} value={o.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {isAdmin && (
              <details className="co-forms">
                <summary>Register an operator</summary>
                <ApiForm title="Register operator" submitLabel="Register operator"
                  onSubmit={(d) => api.oversightCreateOperator(d)}
                  onDone={(r) => { announce(`Operator ${r.icao_designator} registered`); load(); setSelected(r.id) }}>
                  <Field label="ICAO designator" name="icao_designator" required maxLength={3} pattern="[A-Za-z]{3}"
                    autoCapitalize="characters" hint="Three letters, e.g. BHS." />
                  <Field label="Operator name" name="name" required maxLength={120} />
                </ApiForm>
              </details>
            )}
          </section>

          {selected && <OperatorDetail key={`${selected}-${period}`} operatorId={selected} period={period} row={selRow}
            isAdmin={isAdmin} onChanged={load} onReview={openReview} announce={announce} />}
        </>
      )}

      <datalist id="co-registries">
        {['Verra (VCS)', 'Gold Standard', 'American Carbon Registry', 'Climate Action Reserve', 'ART TREES',
          'Global Carbon Council', 'Article 6.4 Mechanism'].map(r => <option key={r} value={r} />)}
      </datalist>
      <ReviewDialog claim={reviewing} onClose={closeReview}
        onReviewed={() => { const after = reviewReturn.current?.after; closeReview(); after?.() }} />
    </div>
  )
}
