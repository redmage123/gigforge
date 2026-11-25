import { useId, useState } from 'react'
import { api, saveBlob } from '../../api/client'
import { ACCEPT_DOCS, uploadBody } from './aiUpload'

/**
 * AI tools for the CORSIA oversight register: questions answered from the register,
 * drafts of outgoing documents, and a check of an ICAO document against the rules
 * on file. Everything here is advice or a draft; nothing is recorded or sent.
 */

const DRAFTS = {
  shortfall_notice: { label: 'Shortfall notice to an operator', operator: true },
  information_request: { label: 'Information request to an operator', operator: true },
  state_report_cover: { label: 'Cover note for the state report to the registry', operator: false },
}

function AskRegister({ announce }) {
  const id = useId()
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [answer, setAnswer] = useState(null)
  const [error, setError] = useState('')
  const ask = async (e) => {
    e.preventDefault()
    setBusy(true); setError(''); setAnswer(null)
    try {
      const r = await api.oversightAiAsk(q)
      setAnswer({ q, text: r.answer })
      announce('Answer ready')
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  return (
    <form className="co-form" onSubmit={ask} aria-label="Ask about the register">
      <div className="co-field" style={{ width: '100%' }}>
        <label htmlFor={id}>Ask about the register</label>
        <input id={id} value={q} onChange={e => setQ(e.target.value)} maxLength={500} required
          placeholder="e.g. Which operators are short for 2024–2026, and why?" aria-describedby={`${id}-hint`} />
        <small id={`${id}-hint`} className="co-hint">Answered by AI from the register’s current records, citing claims as #12 or F3. Check anything you rely on.</small>
      </div>
      <button type="submit" className="btn btn-primary btn-sm" disabled={busy || !q.trim()}>{busy ? 'Thinking…' : 'Ask'}</button>
      {error && <p className="co-form-error" role="alert">{error}</p>}
      <div role="status" aria-live="polite">
        {answer && <div className="co-ai-answer"><p className="co-dim">Q: {answer.q}</p><p>{answer.text}</p></div>}
      </div>
    </form>
  )
}

function DraftDocument({ period, operators, announce }) {
  const kindId = useId(), opId = useId(), textId = useId()
  const [kind, setKind] = useState('shortfall_notice')
  const [operatorId, setOperatorId] = useState('')
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState(null)
  const [error, setError] = useState('')
  const needsOp = DRAFTS[kind].operator
  const make = async (e) => {
    e.preventDefault()
    setBusy(true); setError(''); setDraft(null)
    try {
      const r = await api.oversightAiDraft({ kind, period, operator_id: needsOp ? operatorId : null })
      setDraft(r)
      announce('Draft ready; edit it before using it')
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  const download = () => {
    const op = operators.find(o => String(o.id) === String(operatorId))
    saveBlob(new Blob([draft.text], { type: 'text/plain' }), `${kind}-${period}${needsOp && op ? `-${op.icao_designator}` : ''}.txt`)
  }
  return (
    <form className="co-form" onSubmit={make} aria-label="Draft a document">
      <div className="co-form-grid">
        <div className="co-field">
          <label htmlFor={kindId}>Document</label>
          <select id={kindId} value={kind} onChange={e => { setKind(e.target.value); setDraft(null) }}>
            {Object.entries(DRAFTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        {needsOp && (
          <div className="co-field">
            <label htmlFor={opId}>Operator</label>
            <select id={opId} value={operatorId} onChange={e => setOperatorId(e.target.value)} required>
              <option value="">Choose…</option>
              {operators.map(o => <option key={o.id} value={o.id}>{o.icao_designator} · {o.name}</option>)}
            </select>
          </div>
        )}
      </div>
      <button type="submit" className="btn btn-primary btn-sm" disabled={busy || (needsOp && !operatorId)}>{busy ? 'Drafting…' : `Draft for ${period}`}</button>
      {error && <p className="co-form-error" role="alert">{error}</p>}
      {draft && (
        <div className="co-ai-answer" style={{ width: '100%' }}>
          <label htmlFor={textId} className="co-hint">Draft (editable). Nothing is sent; copy or download it once checked.</label>
          <textarea id={textId} className="co-draft" rows={16} value={draft.text} onChange={e => setDraft({ ...draft, text: e.target.value })} />
          <div className="co-head-actions">
            <button type="button" className="toggle-btn" onClick={download}>Download (.txt)</button>
            <button type="button" className="toggle-btn" onClick={() => navigator.clipboard?.writeText(draft.text).then(() => announce('Draft copied'))}>Copy</button>
          </div>
          <details>
            <summary>Figures the draft was written from</summary>
            <pre className="co-facts">{JSON.stringify(draft.facts, null, 2)}</pre>
          </details>
        </div>
      )}
    </form>
  )
}

function RulesCheck({ announce }) {
  const id = useId()
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState(null)
  const [error, setError] = useState('')
  const run = async () => {
    setBusy(true); setError(''); setRes(null)
    try {
      const r = await api.oversightAiRules(await uploadBody(file))
      setRes(r)
      announce(`${r.changes.length} rule differences, ${r.affected.length} items affected. Nothing has been changed.`)
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  return (
    <div className="cert-reader">
      <div className="cert-reader-row">
        <label htmlFor={id}><b>Check an ICAO document against the rules on file (AI)</b></label>
        <input id={id} type="file" accept={ACCEPT_DOCS} aria-describedby={`${id}-hint`}
          onChange={e => { setFile(e.target.files?.[0] || null); setRes(null) }} />
        <button type="button" className="btn btn-sm btn-primary" onClick={run} disabled={!file || busy}>{busy ? 'Comparing…' : 'Compare'}</button>
      </div>
      <small id={`${id}-hint`} className="co-hint">
        For example ICAO’s “CORSIA Eligible Emissions Units” or approved sustainability schemes. Lists what differs and
        which claims it would affect. The rules are not changed: a developer applies any update.
      </small>
      {error && <p className="co-form-error" role="alert">{error}</p>}
      <div role="status" aria-live="polite">
        {res && (
          <div className="cert-result">
            <p>Read <b>{res.filename}</b>{res.title && ` (${res.title}${res.edition ? `, ${res.edition}` : ''})`}.</p>
            {res.changes.length === 0 ? <p>No differences from the rules on file.</p> : (
              <div className="table-scroll" role="region" aria-label="Rule differences" tabIndex={0}>
                <table className="data-table co-table">
                  <thead><tr><th scope="col">Rule</th><th scope="col">On file</th><th scope="col">In the document</th></tr></thead>
                  <tbody>{res.changes.map((c, i) => <tr key={i}><th scope="row">{c.rule}</th><td>{c.on_file}</td><td>{c.document}</td></tr>)}</tbody>
                </table>
              </div>
            )}
            {res.affected.length > 0 && (
              <>
                <p><b>Would affect:</b></p>
                <ul className="cert-warnings">{res.affected.map((a, i) => <li key={i}>{a.claim}{a.operator && ` (${a.operator})`}: {a.effect}</li>)}</ul>
              </>
            )}
            {res.notes.length > 0 && <ul className="cert-notes">{res.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
            <p className="co-dim">{res.next_step}</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default function AiTools({ period, operators, isAdmin, announce }) {
  return (
    <section className="card" aria-labelledby="co-ai-h">
      <div className="card-header"><h3 id="co-ai-h">AI assistant</h3></div>
      <p className="co-note">
        Answers and drafts are prepared by AI (Claude) from the register’s own records. They are advice: nothing is
        recorded, changed or sent, and every decision stays with a reviewer.
      </p>
      <AskRegister announce={announce} />
      {isAdmin && (
        <div className="co-forms">
          <details>
            <summary>Draft a notice, request or cover note</summary>
            <DraftDocument period={period} operators={operators} announce={announce} />
          </details>
          <details>
            <summary>Check an ICAO rules document</summary>
            <RulesCheck announce={announce} />
          </details>
        </div>
      )}
    </section>
  )
}
