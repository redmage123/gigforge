import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { api, saveBlob } from '../api/client'
import { useSearchParams } from 'react-router-dom'
import { useUrlState } from '../components/share/useUrlState'
import CertificateReader from '../components/oversight/CertificateReader'
import NerPanel from '../components/oversight/NerPanel'
import AiDocReader from '../components/oversight/AiDocReader'
import AiTools from '../components/oversight/AiTools'
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
  FUEL_DOUBLE_CLAIM: 'Fuel batch claimed twice', FUEL_BELOW_THRESHOLD: 'Fuel not eligible (under 10 % reduction)',
  FUEL_SCHEME_UNRECOGNISED: 'Unrecognised certification scheme', FUEL_CLAIMED_ELSEWHERE: 'Fuel not declared unclaimed elsewhere',
  FUEL_EXCEEDS_USE: 'Fuel claimed exceeds fuel used',
  NER_NO_STATEMENT: 'No registry statement', NER_STATEMENT_OLDER: 'Registry statement too old',
  NER_NOT_FOUND: 'Units not in registry', NER_NOT_AUTHORISED: 'Not authorised for CORSIA',
  NER_NO_ADJUSTMENT: 'No corresponding adjustment', NER_NOT_CANCELLED: 'Not cancelled for CORSIA in registry',
  NER_CANCELLED_BY_OTHER: 'Cancelled by another operator', NER_REFERENCE_MISMATCH: 'Cancellation reference differs',
  NER_VINTAGE_MISMATCH: 'Vintage differs from registry',
  NER_LOA_NOT_ON_FILE: 'Letter of authorisation not on file', NER_LOA_MISMATCH: 'Differs from letter of authorisation',
  NER_LOA_EXCEEDED: 'More units than the letter authorises',
  UNUSUAL_CHANGE: 'Unusual change in emissions', UNUSUAL_GROWTH_FACTOR: 'Unusual growth factor',
  UNUSUAL_FUEL_SPLIT: 'Possible split fuel batch', UNUSUAL_OBSERVED_RATIO: 'Unusually low against observation',
}
const REPORT_LABELS = { year: 'Year', verified_co2_t: 'Verified CO₂', verifier: 'Verification body', reference: 'Report reference' }
const CLAIM_LABELS = {
  registry: 'Registry', quantity: 'Quantity', vintage: 'Vintage', serial_block: 'Serial block', serial_start: 'Serial start',
  serial_end: 'Serial end', project_id: 'Project ID', project_name: 'Project name', cancelled_on: 'Cancellation date',
  registry_reference: 'Registry cancellation reference',
}
const NER_CHECK = {
  MATCHED: ['Registry: matches', 'ok'], PROBLEMS: ['Registry: problems', 'bad'],
  STALE: ['Registry: statement too old', 'warn'], NO_STATEMENT: ['Registry: not checked', 'muted'],
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
function ApiForm({ title, submitLabel, onSubmit, onDone, children, className = '', id }) {
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
      // Hidden inputs keep script-set values through reset(); clear AI provenance so it can't carry over.
      form.querySelectorAll('input[type=hidden]').forEach(el => { el.value = '' })
      form.querySelectorAll('.ai-filled').forEach(el => el.classList.remove('ai-filled'))
      onDone?.(result)
    } catch (err) {
      setError(err.message)
      requestAnimationFrame(() => errRef.current?.focus())
    } finally { setBusy(false) }
  }
  return (
    <form id={id} className={`co-form ${className}`} onSubmit={submit} aria-label={title} noValidate={false}>
      <div className="co-form-grid">{children}</div>
      <div ref={errRef} tabIndex={-1} role="alert" className="co-form-error">{error}</div>
      <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>{busy ? 'Saving…' : submitLabel}</button>
    </form>
  )
}

/** Modal review dialog (native <dialog>: focus trap + Esc built in). */
/** AI review brief: drafted from the register's own record; the reviewer decides. */
function ReviewBrief({ claim, formId }) {
  const [brief, setBrief] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const draft = async () => {
    setBusy(true); setError('')
    try {
      const b = await api.oversightAiBrief({ kind: claim.kind === 'fuel' ? 'fuel' : 'unit', claim_id: claim.id })
      setBrief(b)
      const form = document.getElementById(formId)
      if (form) {
        form.elements.reason.value = b.reason_draft
        form.elements.reason.classList.add('ai-filled')
        form.elements.ai_brief.value = b.brief_text
        const radio = b.decision_to_preselect && form.querySelector(`input[name=decision][value=${b.decision_to_preselect}]`)
        if (radio) radio.checked = true
      }
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  const SUGGEST = { VERIFIED: 'verify', REJECTED: 'reject', REOPENED: 'reopen', REQUEST_INFORMATION: 'ask the operator for more information' }
  return (
    <div className="cert-reader">
      <button type="button" className="btn btn-sm btn-primary" onClick={draft} disabled={busy}>
        {busy ? 'Preparing brief…' : brief ? 'Redraft brief (AI)' : 'Draft review brief (AI)'}</button>
      <small className="co-hint"> From the register’s record only. It suggests; you decide.</small>
      {error && <p className="co-form-error" role="alert">{error}</p>}
      <div role="status" aria-live="polite">
        {brief && (
          <div className="cert-result">
            <p>{brief.summary}</p>
            {brief.cautions.length > 0 && <ul className="cert-warnings">{brief.cautions.map((c, i) => <li key={i}>{c}</li>)}</ul>}
            <p><b>Operator says:</b> {brief.operator_says}</p>
            {brief.records_show.length > 0 && <ul className="cert-notes">{brief.records_show.map((r, i) => <li key={i}>{r}</li>)}</ul>}
            {brief.findings_assessment.length > 0 && (
              <ul className="cert-notes">{brief.findings_assessment.map((f, i) => <li key={i}><b>{f.finding}:</b> {f.comment}</li>)}</ul>
            )}
            {brief.missing_evidence.length > 0 && <p><b>Missing:</b> {brief.missing_evidence.join('; ')}</p>}
            <p><b>Suggestion:</b> {SUGGEST[brief.suggested_decision]}.{' '}
              {brief.decision_to_preselect ? 'The decision and reason below are pre-filled; change them as you see fit.'
                : 'The reason below is pre-filled; choose the decision yourself.'}</p>
          </div>
        )}
      </div>
    </div>
  )
}

function ReviewDialog({ claim, onClose, onReviewed, aiReady }) {
  const fuel = claim?.kind === 'fuel'
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
      <h3 id="co-review-h">Review {fuel ? `fuel claim F${claim.id}` : `claim #${claim.id}`}</h3>
      {fuel ? (
        <p className="co-dim">
          {claim.icao_designator} · {claim.year} · {n(claim.mass_t)} t {claim.fuel_type} ({claim.pathway || 'pathway not given'}) ·
          batch {claim.batch_id} · {claim.ls_value} gCO₂e/MJ ({claim.ls_basis.toLowerCase()}) · {claim.scheme}
          {claim.certificate_ref && ` ${claim.certificate_ref}`} · reduction {n(claim.emissions_reduction_t)} t CO₂ ·
          currently <Badge map={CLAIM_STATUS} value={claim.status} />
        </p>
      ) : (
        <p className="co-dim">
          {claim.icao_designator} · {n(claim.quantity)} units · {claim.registry} {claim.serial_block}
          {claim.serial_start != null && ` ${claim.serial_start}–${claim.serial_end}`} · vintage {claim.vintage} ·
          currently <Badge map={CLAIM_STATUS} value={claim.status} />
        </p>
      )}
      {aiReady && <ReviewBrief key={`${claim.kind}-${claim.id}`} claim={claim} formId="co-review-form" />}
      <ApiForm id="co-review-form" title={`Review ${fuel ? 'fuel claim' : 'claim'} ${claim.id}`} submitLabel="Record decision"
        onSubmit={(d) => (fuel ? api.oversightReviewFuel(claim.id, d) : api.oversightReview(claim.id, d))} onDone={(r) => onReviewed(r)}>
        <fieldset className="co-radios">
          <legend>Decision</legend>
          {allowed.map((d, i) => (
            <label key={d}><input type="radio" name="decision" value={d} required defaultChecked={i === 0} />
              {{ VERIFIED: fuel ? 'Verified — certificate and batch checked with the certification scheme' : 'Verified — units confirmed cancelled in the registry',
                REJECTED: 'Rejected', REOPENED: 'Reopen for review' }[d]}</label>
          ))}
        </fieldset>
        <Field as="textarea" label="Reason" name="reason" rows={3} maxLength={1000}
          hint="Required to reject or reopen. Recorded permanently with your name." />
        <input type="hidden" name="ai_brief" />
      </ApiForm>
      <button type="button" className="toggle-btn co-dialog-close" onClick={() => ref.current?.close()}>Cancel</button>
    </dialog>
  )
}

/** One finding, with an optional AI explanation of what it could mean. */
function FindingItem({ f, period, aiReady, onOpen }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const explain = async () => {
    setBusy(true)
    try { setText((await api.oversightAiExplain(period, f)).explanation) } catch (e) { setText(e.message) } finally { setBusy(false) }
  }
  const what = `${f.operator}${f.claim_id ? `, claim ${f.claim_id}` : f.fuel_claim_id ? `, fuel claim F${f.fuel_claim_id}` : ''}`
  return (
    <li className={`sev-${f.severity}`}>
      <Badge map={SEVERITY} value={f.severity} />
      <span><b>{f.operator}</b> · {KIND[f.kind] || f.kind}: {f.message}
        <span role="status" aria-live="polite">{text && <span className="co-explain"><b>AI explanation:</b> {text}</span>}</span>
      </span>
      <span className="co-finding-actions">
        {aiReady && !text && <button type="button" className="toggle-btn" onClick={explain} disabled={busy}
          aria-label={`Explain finding for ${what}`}>{busy ? 'Explaining…' : 'Explain (AI)'}</button>}
        <button type="button" className="toggle-btn" onClick={onOpen} aria-label={`Open ${what}`}>Open</button>
      </span>
    </li>
  )
}

function OperatorDetail({ operatorId, period, periodYears, row, isAdmin, onChanged, onReview, announce, aiReady }) {
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
  const fuelClaims = (detail.fuel_claims || []).filter(f => f.year >= periodYears[0] && f.year <= periodYears[1])
  return (
    <section className="card co-detail" aria-labelledby="co-detail-h">
      <h3 id="co-detail-h" tabIndex={-1} ref={headingRef}>{op.icao_designator} — {op.name}</h3>

      <h4>Emissions and requirement, {period}</h4>
      <div className="table-scroll" role="region" aria-label={`${op.icao_designator} emissions by year`} tabIndex={0}>
        <table className="data-table co-table">
          <thead><tr>
            <th scope="col">Year</th><th scope="col">Verified CO₂ (t)</th><th scope="col">Growth factor</th>
            <th scope="col">Requirement (units)</th><th scope="col">Eligible fuel claimed (t)</th><th scope="col">Verified fuel reduction (t CO₂)</th>
            <th scope="col">BACSWN observed in FIR (t)</th><th scope="col">Report</th>
          </tr></thead>
          <tbody>
            {row?.years.map(y => (
              <tr key={y.year}>
                <th scope="row">{y.year}</th>
                <td className="num">{y.report ? n(y.report.verified_co2_t) : <span className="co-dim">Not reported</span>}</td>
                <td className="num">{y.report ? y.report.growth_factor : '—'}</td>
                <td className="num">{n(y.offsetting_requirement_t)}</td>
                <td className="num">{n(y.cef_mass_t)}</td>
                <td className="num">{n(y.cef_reduction_t)}</td>
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
                    {c.registry_reference && <small className="co-dim"><br />ref {c.registry_reference}</small>}
                    {c.ner_check && <><br /><Badge map={NER_CHECK} value={c.ner_check.result} />
                      {c.ner_check.as_of && <small className="co-dim"> statement {c.ner_check.as_of}</small>}
                      {c.ner_check.issues.length > 0 && (
                        <ul className="co-history">{c.ner_check.issues.map(i => <li key={i.kind}>{i.message}</li>)}</ul>
                      )}</>}</td>
                  <td>{c.vintage}{!c.declared_eligible && <><br /><span className="co-badge bad">Not CORSIA-eligible</span></>}</td>
                  <td>{c.project_name || c.project_id || '—'}</td>
                  <td>{c.cancelled_on}</td>
                  <td><Badge map={CLAIM_STATUS} value={c.status} /></td>
                  <td>{c.reviews.length === 0 ? <span className="co-dim">None</span> : (
                    <ol className="co-history">{c.reviews.map((r, i) => (
                      <li key={i}><b>{CLAIM_STATUS[r.decision]?.[0] || r.decision}</b> by {r.created_by}, {r.created_at.slice(0, 10)}{r.reason && ` — ${r.reason}`}{r.ai_assisted && <small className="co-dim"> (AI brief used)</small>}</li>
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

      <h4 id="co-fuel-h">Eligible-fuel claims (SAF / LCAF), {period}</h4>
      <p className="co-note">
        CORSIA lets an operator reduce its offsetting requirement with eligible fuel it used: reduction =
        3.16 × fuel mass (t) × (1 − life-cycle value ÷ 89 gCO₂e/MJ). Only verified claims for fuels with a life-cycle
        value of 80.1 or less (at least a 10 % cut) count.
      </p>
      {fuelClaims.length === 0 ? <p className="co-dim">No eligible-fuel claims recorded for this period.</p> : (
        <div className="table-scroll" role="region" aria-labelledby="co-fuel-h" tabIndex={0}>
          <table className="data-table co-table">
            <thead><tr>
              <th scope="col">Claim</th><th scope="col">Year</th><th scope="col">Fuel</th><th scope="col">Mass (t)</th>
              <th scope="col">Life-cycle value</th><th scope="col">Reduction (t CO₂)</th><th scope="col">Batch / certificate</th>
              <th scope="col">Status</th><th scope="col">Review history</th>
              {isAdmin && <th scope="col"><span className="sr-only">Actions</span></th>}
            </tr></thead>
            <tbody>
              {fuelClaims.map(f => (
                <tr key={f.id} id={`co-fuel-${f.id}`}>
                  <th scope="row">F{f.id}</th>
                  <td>{f.year}</td>
                  <td>{f.fuel_type}{f.pathway && ` · ${f.pathway}`}{f.feedstock && <small className="co-dim"><br />{f.feedstock}</small>}</td>
                  <td className="num">{n(f.mass_t)}</td>
                  <td className="num">{f.ls_value} <small className="co-dim">gCO₂e/MJ, {f.ls_basis.toLowerCase()}</small>
                    {!f.eligible && <><br /><span className="co-badge bad">Under 10 % cut</span></>}</td>
                  <td className="num">{f.eligible ? n(f.emissions_reduction_t) : <span className="co-dim">0 (not eligible)</span>}</td>
                  <td>{f.batch_id}<small className="co-dim"><br />{f.scheme}{f.certificate_ref && ` · ${f.certificate_ref}`}{f.producer && ` · ${f.producer}`}</small>
                    {!f.not_claimed_elsewhere && <><br /><span className="co-badge bad">May be claimed elsewhere</span></>}</td>
                  <td><Badge map={CLAIM_STATUS} value={f.status} /></td>
                  <td>{f.reviews.length === 0 ? <span className="co-dim">None</span> : (
                    <ol className="co-history">{f.reviews.map((r, i) => (
                      <li key={i}><b>{CLAIM_STATUS[r.decision]?.[0] || r.decision}</b> by {r.created_by}, {r.created_at.slice(0, 10)}{r.reason && ` — ${r.reason}`}{r.ai_assisted && <small className="co-dim"> (AI brief used)</small>}</li>
                    ))}</ol>
                  )}</td>
                  {isAdmin && <td><button type="button" className="toggle-btn" onClick={() => onReview({ ...f, kind: 'fuel', icao_designator: op.icao_designator }, () => refresh(`Fuel claim F${f.id} reviewed`))}
                    aria-label={`Review fuel claim F${f.id}`}>Review</button></td>}
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
            {aiReady && <AiDocReader kind="report" labels={REPORT_LABELS} formId={`co-report-form-${op.id}`} operatorId={op.id}
              period={period} onFilled={announce} />}
            <ApiForm id={`co-report-form-${op.id}`} title="Record emissions report" submitLabel="Record report"
              onSubmit={(d) => api.oversightAddReport(op.id, d)}
              onDone={(r) => refresh(`Report recorded for ${r.year}, revision ${r.revision}. Requirement ${n(r.offsetting_requirement_t)} units.`)}>
              <Field label="Year" name="year" type="number" required min={2019} max={new Date().getFullYear()} inputMode="numeric" />
              <Field label="Verified CO₂ (tonnes)" name="verified_co2_t" type="number" required min={0} step={1} inputMode="numeric" />
              <Field label="Growth factor" name="growth_factor" type="number" required min={0} max={1} step="any"
                hint="The sector growth factor ICAO published for that year (0–1)." />
              <Field label="Verification body" name="verifier" maxLength={120} />
              <Field label="Report reference" name="reference" maxLength={120} />
              <input type="hidden" name="notes" />
            </ApiForm>
            <p className="co-note">A second report for the same year supersedes the first; both stay on record.</p>
          </details>
          <details>
            <summary>Record a unit cancellation claim</summary>
            {aiReady && <AiDocReader kind="cancellation" labels={CLAIM_LABELS} formId={`co-claim-form-${op.id}`} operatorId={op.id}
              period={period} onFilled={announce} />}
            <ApiForm id={`co-claim-form-${op.id}`} title="Record cancellation claim" submitLabel="Record claim"
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
              <input type="hidden" name="notes" />
            </ApiForm>
          </details>
          <details>
            <summary>Record an eligible-fuel claim (SAF / LCAF)</summary>
            {aiReady && <CertificateReader operatorId={op.id} formId={`co-fuel-form-${op.id}`} onFilled={announce} />}
            <ApiForm id={`co-fuel-form-${op.id}`} title="Record eligible-fuel claim" submitLabel="Record fuel claim"
              onSubmit={(d) => api.oversightAddFuelClaim(op.id, d)}
              onDone={(r) => refresh(`Fuel claim F${r.id} recorded as pending review; it would reduce the requirement by ${n(r.emissions_reduction_t)} t CO₂.`)}>
              <Field label="Year used" name="year" type="number" required min={periodYears[0]} max={Math.min(periodYears[1], new Date().getFullYear())} inputMode="numeric" />
              <Field as="select" label="Fuel type" name="fuel_type" required defaultValue="SAF"
                hint="SAF: sustainable aviation fuel. LCAF: lower-carbon aviation fuel (fossil).">
                <option value="SAF">SAF</option><option value="LCAF">LCAF</option>
              </Field>
              <Field label="Fuel mass (tonnes)" name="mass_t" type="number" required min={0.001} step="any" inputMode="decimal" />
              <Field label="Life-cycle emissions value (gCO₂e/MJ)" name="ls_value" type="number" required min={-100} max={88.99} step="any"
                inputMode="decimal" hint="From the ICAO default values or the certified actual value. 80.1 or less to be eligible." />
              <Field as="select" label="Life-cycle value basis" name="ls_basis" required defaultValue="DEFAULT">
                <option value="DEFAULT">ICAO default value</option><option value="ACTUAL">Actual (certified) value</option>
              </Field>
              <Field label="Batch ID" name="batch_id" required maxLength={120} hint="Used to detect the same batch claimed twice." />
              <Field label="Certification scheme" name="scheme" required maxLength={80} list="co-schemes" />
              <Field label="Certificate / proof of sustainability" name="certificate_ref" maxLength={120} />
              <Field label="Conversion pathway" name="pathway" maxLength={80} list="co-pathways" />
              <Field label="Feedstock" name="feedstock" maxLength={120} />
              <Field label="Producer" name="producer" maxLength={120} />
              <div className="co-field co-check">
                <label><input type="checkbox" name="not_claimed_elsewhere" defaultChecked /> Operator declares the batch is not claimed under any other scheme</label>
              </div>
              <input type="hidden" name="notes" />
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
  const [urlPeriod] = useUrlState('period', '')
  const [, setParams] = useSearchParams()
  const [defaultPeriod, setDefaultPeriod] = useState('')
  const [reg, setReg] = useState(null)
  const [error, setError] = useState('')
  const [selected, setSelected] = useUrlState('operator', null, (s) => (/^\d+$/.test(s) ? Number(s) : undefined))
  const [reviewing, setReviewing] = useState(null)
  const [message, setMessage] = useState('')
  const reviewReturn = useRef(null)
  // AI certificate reading is offered only when the server has it configured.
  const [aiReady, setAiReady] = useState(false)
  useEffect(() => { api.aiStatus().then(s => setAiReady(!!s.configured)).catch(() => {}) }, [])

  useEffect(() => {
    api.oversightPeriods().then(d => {
      setPeriods(d.periods)
      setDefaultPeriod((d.periods.find(p => p.current) || d.periods[0])?.id || '')
    }).catch(e => setError(e.message))
  }, [])
  // A shared link may name a period; ignore it if it is not a real one.
  const period = periods.some(p => p.id === urlPeriod) ? urlPeriod : defaultPeriod
  // Changing period also closes the operator: one URL update (two would overwrite each other).
  const changePeriod = (p) => setParams(q => {
    const next = new URLSearchParams(q)
    if (p === defaultPeriod) next.delete('period'); else next.set('period', p)
    next.delete('operator')
    return next
  }, { replace: true, preventScrollReset: true })
  const periodYears = periods.find(p => p.id === period)?.years || [0, 9999]

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
  const exportCsv = async (fuel) => {
    try {
      const blob = await (fuel ? api.oversightFuelCsv(period) : api.oversightCsv(period))
      saveBlob(blob, `corsia-${fuel ? 'fuel-' : ''}claims-${period}.csv`)
      announce(`${fuel ? 'Eligible-fuel' : 'Unit'} claims downloaded as CSV`)
    } catch (e) { announce(e.message) }
  }
  const showClaim = (f) => {
    setSelected(f.operator_id)
    const target = f.claim_id ? `co-claim-${f.claim_id}` : f.fuel_claim_id ? `co-fuel-${f.fuel_claim_id}` : null
    if (target) setTimeout(() => document.getElementById(target)?.scrollIntoView({ block: 'center' }), 400)
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
            <select value={period} onChange={e => changePeriod(e.target.value)}>
              {periods.map(p => <option key={p.id} value={p.id}>{p.id} · {p.label}{p.current ? ' (current)' : ''}</option>)}
            </select>
          </label>
          <button type="button" className="toggle-btn" onClick={() => exportCsv(false)} disabled={!reg}>Export unit claims (CSV)</button>
          <button type="button" className="toggle-btn" onClick={() => exportCsv(true)} disabled={!reg}>Export fuel claims (CSV)</button>
        </div>
      </div>
      <div className="sr-only" role="status" aria-live="polite">{message}</div>
      {error && <p role="alert" className="co-form-error">{error}</p>}

      <p className="co-intro">
        Airlines buy and cancel CORSIA-eligible units in a registry, and can reduce what they owe by using CORSIA-eligible
        fuel. This register records what each operator reports and the state’s review of every claim. Entries are never edited or deleted: a revised report supersedes the earlier one,
        and each review decision is added to the claim’s history.
        {!isAdmin && ' You have read-only access; administrators record evidence and review claims.'}
      </p>

      {reg && (
        <>
          <div className="card-grid co-stats">
            <div className="stat-card"><span className="stat-label">Offsetting requirement</span>
              <span className="stat-value">{n(t.final_requirement_t)}</span>
              <span className="stat-detail">units: {n(t.offsetting_requirement_t)} from verified reports, less eligible fuel</span></div>
            <div className="stat-card"><span className="stat-label">Eligible-fuel reduction</span>
              <span className="stat-value info">{n(t.cef_reduction_t)}</span>
              <span className="stat-detail">t CO₂ verified{t.pending_cef_reduction_t ? `; ${n(t.pending_cef_reduction_t)} awaiting review` : ''}</span></div>
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
                  <FindingItem key={`${f.kind}-${f.operator_id}-${f.claim_id}-${f.fuel_claim_id}-${i}`} f={f} period={period}
                    aiReady={aiReady} onOpen={() => showClaim(f)} />
                ))}
              </ul>
            )}
          </section>

          <NerPanel period={period} isAdmin={isAdmin} aiReady={aiReady} announce={announce} onImported={load} />

          {aiReady && <AiTools period={period} operators={reg.operators} isAdmin={isAdmin} announce={announce} />}

          <section className="card" aria-labelledby="co-ops-h">
            <div className="card-header"><h3 id="co-ops-h">Operators</h3></div>
            {reg.operators.length === 0 ? <p className="co-dim">No operators registered yet.</p> : (
              <div className="table-scroll" role="region" aria-labelledby="co-ops-h" tabIndex={0}>
                <table className="data-table co-table">
                  <thead><tr>
                    <th scope="col">Operator</th><th scope="col">Reports</th><th scope="col">Requirement</th>
                    <th scope="col">Fuel reduction</th><th scope="col">Net requirement</th><th scope="col">Verified</th>
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
                        <td className="num">{o.cef_reduction_t ? `−${n(o.cef_reduction_t)}` : '—'}
                          {o.pending_cef_reduction_t ? <small className="co-dim"><br />{n(o.pending_cef_reduction_t)} pending</small> : null}</td>
                        <td className="num">{n(o.final_requirement_t)}</td>
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

          {selected && <OperatorDetail key={`${selected}-${period}`} operatorId={selected} period={period} periodYears={periodYears} row={selRow} aiReady={aiReady}
            isAdmin={isAdmin} onChanged={load} onReview={openReview} announce={announce} />}
        </>
      )}

      <datalist id="co-registries">
        {['Bahamas National Emissions Registry', 'Verra (VCS)', 'Gold Standard', 'American Carbon Registry', 'Climate Action Reserve', 'ART TREES',
          'Global Carbon Council', 'Article 6.4 Mechanism'].map(r => <option key={r} value={r} />)}
      </datalist>
      <datalist id="co-schemes">
        {['ISCC CORSIA', 'ISCC CORSIA PLUS', 'RSB CORSIA'].map(r => <option key={r} value={r} />)}
      </datalist>
      <datalist id="co-pathways">
        {['HEFA', 'FT (Fischer–Tropsch)', 'ATJ (alcohol-to-jet)', 'Co-processing', 'SIP', 'PtL (power-to-liquid)'].map(r => <option key={r} value={r} />)}
      </datalist>
      <ReviewDialog claim={reviewing} onClose={closeReview} aiReady={aiReady && isAdmin}
        onReviewed={() => { const after = reviewReturn.current?.after; closeReview(); after?.() }} />
    </div>
  )
}
