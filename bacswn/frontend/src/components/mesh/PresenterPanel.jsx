/**
 * PresenterPanel: "show it now" controls in the precog chamber (Mesh page).
 *
 * Why: in a live demo the weather rarely produces the state the presenter wants
 * to explain; this stages it on demand using the real voting logic.
 * How: the chosen verdict, outcome (and dissenting model) go to the parent's
 * onPresent, which posts them to /api/mesh/present.
 */
import { useState } from 'react'

/**
 * Presenter controls: make the selected station show a chosen verdict and voting
 * outcome right now, instead of waiting for the weather to produce it. The
 * server parks matching weather over the station (or overrides a model) and the
 * normal 2-of-3 and peer-verification logic does the rest.
 */
/** Weather verdicts a presenter can stage. */
export const VERDICTS = [
  { id: 'CLEAR', label: 'Clear' },
  { id: 'SHOWERS', label: 'Showers' },
  { id: 'IFR', label: 'IFR (fog / low cloud)' },
  { id: 'TSRA', label: 'Thunderstorm (TSRA)' },
  { id: 'SQUALL', label: 'Squall line' },
]
/**
 * Voting outcomes a presenter can stage. `clear`: allowed with the Clear verdict;
 * `model`: needs a dissenting model to be chosen; `help`: what will happen.
 */
export const OUTCOMES = [
  { id: 'agree', label: 'All three models agree', clear: true,
    help: 'Real weather of this type is parked over the station; TEMPO, VISTA and LEXIS all see it (3/3).' },
  { id: 'dissent', label: 'Two agree, one dissents', clear: true, model: true,
    help: 'The chosen model is overridden to disagree, so it files a minority report against the 2/3 verdict.' },
  { id: 'split', label: 'Models split, satellite decides', clear: false,
    help: 'Each model calls something different; with no 2-of-3 majority the satellite breaks the tie.' },
  { id: 'peers_confirm', label: 'Neighbours confirm it', clear: false,
    help: 'The station asks its neighbours to verify; their radar sees it too, so the alert is CONFIRMED and sent to the BACSWN hub.' },
  { id: 'peers_reject', label: 'Neighbours reject it (false alarm)', clear: false,
    help: "Only the station's own sensors report it; neighbours see nothing, so it is REJECTED and maintenance is flagged." },
]

/**
 * Verdict / outcome / model pickers and the "Show it at <station>" button.
 * @param {{node: object, busy: boolean, onPresent: (request: object) => void}} props
 *   `node`: the selected station (its precogs list the models)
 */
export default function PresenterPanel({ node, busy, onPresent }) {
  const [call, setCall] = useState('TSRA')
  const [outcome, setOutcome] = useState('agree')
  const [model, setModel] = useState('VISTA')
  const o = OUTCOMES.find(x => x.id === outcome)
  const blocked = call === 'CLEAR' && !o.clear
  const id = `pp-${node.station}`

  return (
    <div className="presenter-panel">
      <div className="section-label" id={`${id}-h`}>Presenter: show it now</div>
      <div className="pp-grid" role="group" aria-labelledby={`${id}-h`}>
        <label htmlFor={`${id}-call`}>Verdict</label>
        <select id={`${id}-call`} value={call} onChange={e => setCall(e.target.value)}>
          {VERDICTS.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
        </select>
        <label htmlFor={`${id}-out`}>Outcome</label>
        <select id={`${id}-out`} value={outcome} onChange={e => setOutcome(e.target.value)} aria-describedby={`${id}-help`}>
          {OUTCOMES.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}
        </select>
        {o.model && <>
          <label htmlFor={`${id}-model`}>Dissenting model</label>
          <select id={`${id}-model`} value={model} onChange={e => setModel(e.target.value)}>
            {node.precogs.map(p => <option key={p.id} value={p.id}>{p.id}</option>)}
          </select>
        </>}
      </div>
      <p className="pp-help" id={`${id}-help`}>
        {blocked ? 'With Clear, choose "All three models agree" or "Two agree, one dissents".' : o.help}
        {' '}Holds about 90 seconds; "Clear faults" ends it early.
      </p>
      <button type="button" className="btn btn-sm btn-primary" disabled={busy || blocked}
        onClick={() => onPresent({ station: node.station, call, outcome, ...(o.model ? { model } : {}) })}>
        Show it at {node.station}
      </button>
    </div>
  )
}
