/**
 * Every consensus and fault state at once, as static station cards that never
 * change. Built for presenting: no live data, so nothing moves while you explain
 * it. Hover, focus or tap a card for what it means, when it happens, and how to
 * make it appear live on the Mesh page.
 *
 * How: STATES is hand-written example data in the shape of a live station;
 * each card is the label of a HoverTip whose popup holds the explanation.
 */
import HoverTip from '../a11y/HoverTip'
import { HAZARD_COLORS, VERDICT_EXAMPLES, hz } from './PrecogChamber'


const OFF = '#64748b'                                  // offline marker
const C = (call) => HAZARD_COLORS[call] || OFF          // marker colour (graphics)
const T = (call) => (call ? hz(call) : 'var(--text-secondary)')  // text colour, contrast-safe in both themes

/** One example per state: the station card's content plus means / when / show for the popup. */
const STATES = [
  {
    id: 'agree', title: 'All three models agree', station: 'MYNN', name: 'Nassau', status: 'HEALTHY', call: 'CLEAR',
    models: [['TEMPO', 'CLEAR'], ['VISTA', 'CLEAR'], ['LEXIS', 'CLEAR']],
    result: '3/3 agree', tone: 'green',
    means: 'TEMPO, VISTA and LEXIS each reach the same weather verdict on their own. "3/3" means all three models agree about the weather; it is not a system-health score.',
    when: 'Most of the time, at most stations.',
    show: 'Presenter: pick a verdict + "All three models agree".',
  },
  {
    id: 'minority', title: 'Two agree, one dissents', station: 'MYGF', name: 'Freeport', status: 'HEALTHY', call: 'SHOWERS',
    models: [['TEMPO', 'SHOWERS'], ['VISTA', 'TSRA', 'dissent'], ['LEXIS', 'SHOWERS']],
    result: '2/3 · VISTA files a minority report', tone: 'amber',
    means: 'The majority sets the verdict. The outvoted model files a minority report, which is tracked: later it is marked vindicated (it was right) or dismissed.',
    when: 'As storms arrive: VISTA looks 30 minutes ahead, so it often calls a storm first.',
    show: 'Presenter: "Two agree, one dissents" and choose the model.',
  },
  {
    id: 'tiebreak', title: 'Models split, satellite decides', station: 'MYEG', name: 'Exuma', status: 'CAUTION', call: 'TSRA',
    models: [['TEMPO', 'TSRA'], ['VISTA', 'IFR'], ['LEXIS', 'CLEAR']],
    sat: 'TSRA', result: 'Split → satellite sides with TEMPO', tone: 'blue',
    means: 'All three models say something different, so there is no 2-of-3 majority. A fresh Tomorrow.io satellite pass breaks the tie and the model it agrees with wins.',
    when: 'Fast-changing weather, or when one model is faulty.',
    show: 'Presenter: "Models split, satellite decides".',
  },
  {
    id: 'split', title: 'Split with no satellite', station: 'MYEM', name: "Governor's Harbour", status: 'CAUTION', call: 'SHOWERS', flag: '?',
    models: [['TEMPO', 'SHOWERS'], ['VISTA', 'TSRA'], ['LEXIS', 'IFR']],
    sat: null, result: 'Split · holding the previous verdict', tone: 'amber',
    means: 'No majority and no fresh satellite pass, so the station keeps its last verdict rather than guess, and shows a "?" on the map.',
    when: 'Between satellite passes, while the models disagree.',
    show: 'Happens naturally; most often during storms.',
  },
  {
    id: 'confirm', title: 'Neighbours confirm it', station: 'MYBC', name: 'Chub Cay', status: 'HEALTHY', call: 'SHOWERS',
    models: [['TEMPO', 'SHOWERS'], ['VISTA', 'SHOWERS'], ['LEXIS', 'SHOWERS']],
    peers: '3 of 4 neighbours + satellite agree', result: 'CONFIRMED · alert sent to the BACSWN hub', tone: 'green',
    means: 'Peer review: direct neighbours (one hop) check the claim with their own radar and the satellite, and each votes. Enough agreement confirms the alert and it is routed to the BACSWN hub.',
    when: 'Automatically for hazards, or on demand with "Ask peers to verify".',
    show: 'Presenter: "Neighbours confirm it", or press "Ask peers to verify".',
  },
  {
    id: 'reject', title: 'Neighbours reject it', station: 'MYER', name: 'Rock Sound', status: 'DEGRADED', call: 'TSRA', flag: '!',
    models: [['TEMPO', 'TSRA'], ['VISTA', 'TSRA'], ['LEXIS', 'TSRA']],
    peers: '0 of 3 neighbours agree · satellite sees CLEAR', result: 'REJECTED · sensor fault suspected, maintenance ticket raised', tone: 'red',
    means: "The station's own sensors report a storm that its neighbours and the satellite cannot see. The alert is blocked, the station is marked DEGRADED and a maintenance ticket is raised.",
    when: 'False alarms from a faulty local sensor.',
    show: 'Presenter: "Neighbours reject it", or the "Stuck sensor @ Exuma" scenario.',
  },
  {
    id: 'corrupt', title: 'Corrupted model quarantined', station: 'MYAM', name: 'Marsh Harbour', status: 'DEGRADED', call: 'CLEAR', flag: '!',
    models: [['TEMPO', 'CLEAR'], ['VISTA', 'CLEAR'], ['LEXIS', 'SQUALL', 'quarantined']],
    result: '2 of 2 active models agree · LEXIS switched out', tone: 'red',
    means: 'A model that keeps contradicting the evidence is quarantined. The remaining two models keep the station working, so one bad model never takes it down. A quarantined model keeps running in the background and is restored once its calls match the station again for an hour; a corrupted one stays out until it is repaired.',
    when: 'Software faults or bad model inputs.',
    show: 'Inject fault ▸ Corrupt model ▸ LEXIS (or TEMPO / VISTA).',
  },
  {
    id: 'stuck', title: 'Stuck sensor', station: 'MYLD', name: 'Long Island', status: 'DEGRADED', call: 'IFR', flag: '!',
    models: [['TEMPO', 'IFR'], ['VISTA', 'CLEAR', 'dissent'], ['LEXIS', 'IFR']],
    result: 'Visibility stuck at 0.5 SM · radar and satellite disagree', tone: 'red',
    means: 'A stuck visibility sensor makes TEMPO and LEXIS report fog. VISTA, the neighbours and the satellite see clear skies, so the reading is flagged and maintenance is called.',
    when: 'Hardware faults: a fogged lens, a stuck anemometer, a flooded rain gauge.',
    show: 'Inject fault ▸ Stick sensor ▸ visibility (or wind / pressure / rain).',
  },
  {
    id: 'offline', title: 'Station offline', station: 'MYIG', name: 'Inagua', status: 'OFFLINE', call: null,
    models: [['TEMPO', null], ['VISTA', null], ['LEXIS', null]],
    result: 'NO SIGNAL · links fail, traffic re-routes', tone: 'grey',
    means: 'The station is down (power or comms). Its links fail, messages route around it, and neighbours and the satellite keep watching its area. There is no single point of failure.',
    when: 'Power cuts, storm damage, comms loss.',
    show: 'Inject fault ▸ Take offline; "Bring online" restores it.',
  },
  {
    id: 'isolated', title: 'Cut off from the BACSWN hub', station: 'MYMM', name: 'Mayaguana', status: 'CAUTION', call: 'SHOWERS',
    models: [['TEMPO', 'SHOWERS'], ['VISTA', 'SHOWERS'], ['LEXIS', 'SHOWERS']],
    result: 'No route · 4 alerts queued (store-and-forward)', tone: 'amber',
    means: 'The station still works but has no path to the BACSWN hub. It holds its alerts and sends them the moment a path returns; the satellite can still verify hazards on its own.',
    when: 'Network partitions, e.g. a storm cutting links to the southern islands.',
    show: '"Partition the south" scenario.',
  },
]

/** Station status -> badge colour. */
const STATUS_BADGE = { HEALTHY: 'green', CAUTION: 'amber', DEGRADED: 'red', OFFLINE: 'grey' }

/** A static station card for example state `s`, styled like the live map markers. */
function Card({ s }) {
  const color = s.call ? C(s.call) : OFF
  return (
    <span className="sg-card" style={{ '--sg-c': color }}>
      <span className="sg-head">
        <span className="sg-node" aria-hidden="true">
          <span className="sg-dot" />
          {s.flag && <span className={`sg-flag ${s.flag === '!' ? 'critical' : ''}`}>{s.flag}</span>}
        </span>
        <span className="sg-id"><b>{s.station}</b> <span className="sg-name">{s.name}</span></span>
        <span className={`mbadge ${STATUS_BADGE[s.status]}`}>{s.status}</span>
      </span>
      <span className="sg-title">{s.title}</span>
      <span className="sg-verdict">
        {s.call ? <><b style={{ color: T(s.call) }}>{s.call}</b> <span className="sg-example">{VERDICT_EXAMPLES[s.call]}</span></>
          : <b style={{ color: T(null) }}>NO SIGNAL</b>}
      </span>
      <span className="sg-models">
        {s.models.map(([m, call, tag]) => (
          <span key={m} className={`sg-model ${tag || ''}`}>
            <span className="sg-m">{m}</span>
            <span className="sg-mc" style={{ color: T(call) }}>{call || '—'}</span>
            {tag && <span className="sg-tag">{tag === 'dissent' ? 'minority' : tag}</span>}
          </span>
        ))}
      </span>
      {'sat' in s && <span className="sg-line">Satellite: {s.sat ? <b style={{ color: T(s.sat) }}>{s.sat}</b> : 'no fresh pass'}</span>}
      {s.peers && <span className="sg-line">Peers: {s.peers}</span>}
      <span className={`sg-result ${s.tone}`}>{s.result}</span>
    </span>
  )
}

/** The "Every state at a glance" section of the Station & Model Guide. */
export default function StateGallery() {
  return (
    <section className="card mg-section sg" aria-labelledby="mg-glance">
      <h3 id="mg-glance">Every state at a glance</h3>
      <p className="mg-intro">
        Static examples of every vote and fault state side by side. Nothing here updates, so you can stop on any of
        them while presenting. Hover, focus or tap a card for the explanation.
      </p>
      <ul className="sg-grid">
        {STATES.map(s => (
          <li key={s.id}>
            <HoverTip className="sg-tip" label={<Card s={s} />}>
              <strong className="mg-pop-title">{s.title}</strong>
              <span className="mg-pop-row"><em>What it means</em>{s.means}</span>
              <span className="mg-pop-row"><em>When it happens</em>{s.when}</span>
              <span className="mg-pop-row"><em>How to show it live</em>{s.show}</span>
            </HoverTip>
          </li>
        ))}
      </ul>
    </section>
  )
}
