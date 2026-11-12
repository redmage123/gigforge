import { Link } from 'react-router-dom'
import HoverTip from '../components/a11y/HoverTip'
import { HAZARD_COLORS } from '../components/mesh/PrecogChamber'
import '../components/mesh/mesh.css'

/**
 * Static reference: every state a mesh station, its three AI models, the vote
 * and peer verification can be in. Hover (or focus / tap) any item for details,
 * including how a presenter can make it appear on the Mesh page.
 */

const LINK = { vhf: '#10b981', cellular: '#3b82f6', satellite: '#a855f7', down: '#ef4444' }

const SECTIONS = [
  {
    id: 'verdicts', title: 'Station verdicts',
    intro: 'What a station reports about the weather overhead. The most severe matching rule wins.',
    items: [
      { term: 'CLEAR', color: HAZARD_COLORS.CLEAR, short: 'No significant weather',
        means: 'Radar under 28 dBZ, visibility 3 SM or more, cloud base 1,000 ft or higher.',
        when: 'Most of the time at most stations.',
        show: 'Presenter: Clear + "All three models agree".' },
      { term: 'SHOWERS', color: HAZARD_COLORS.SHOWERS, short: 'Light to moderate rain',
        means: 'Radar 28–44 dBZ. Trade-wind showers drift west across the islands.',
        when: 'Common: two or three stations usually have showers.',
        show: 'Presenter: Showers + any outcome.' },
      { term: 'IFR', color: HAZARD_COLORS.IFR, short: 'Fog or low cloud',
        means: 'Visibility under 3 SM or cloud base under 1,000 ft. Affects flights below 10,000 ft.',
        when: 'Radiation fog, most likely around dawn (03:00–09:00 local).',
        show: 'Presenter: IFR + any outcome. Or "Stick visibility" for a fake IFR.' },
      { term: 'TSRA', color: HAZARD_COLORS.TSRA, short: 'Thunderstorm with rain',
        means: 'Radar 45 dBZ or more: turbulence, lightning, wind shear, possible hail. Becomes an aircraft hazard area.',
        when: 'Convective cells, a few times a day.',
        show: 'Presenter: Thunderstorm + any outcome.' },
      { term: 'SQUALL', color: HAZARD_COLORS.SQUALL, short: 'Squall line',
        means: 'A line of storms (40 dBZ or more) with gusts of 34 kt or more and a sudden pressure jump. The most severe verdict.',
        when: 'Frontal squalls from the north-west.',
        show: 'Presenter: Squall line + any outcome, or the "Squall line from Florida" scenario.' },
    ],
  },
  {
    id: 'models', title: 'The three AI models at every station',
    intro: 'Each station runs three independent models. A verdict needs two of the three to agree.',
    items: [
      { term: 'TEMPO', short: 'Sensor time-series model',
        means: "Reads the station's own instruments over time: rain rate, gusts, visibility, cloud base and pressure trend.",
        when: 'Sees weather only once it arrives. Can be fooled by a stuck sensor.',
        show: 'Presenter: "Two agree, one dissents" with TEMPO, or "Stick visibility".' },
      { term: 'VISTA', short: 'Radar + satellite nowcast',
        means: "Uses the station's radar and the satellite feed, looking 30 minutes ahead.",
        when: 'Often the first to call a storm, so it can be outvoted while it is right. Its minority reports are then "vindicated".',
        show: 'Presenter: "Two agree, one dissents" with VISTA.' },
      { term: 'LEXIS', short: 'Weather report (METAR) model',
        means: 'Reads the METAR text, local climate and warnings passed on by upstream stations (see the audit trail).',
        when: 'Conservative: needs the same signal in two reports in a row, so it lags slightly.',
        show: 'Presenter: "Two agree, one dissents" with LEXIS, or "Rogue model @ Nassau".' },
    ],
  },
  {
    id: 'model-states', title: 'Model states',
    intro: 'Badges that can appear on a model card.',
    items: [
      { term: 'Agrees', short: 'Part of the majority',
        means: 'The model matches the station verdict.', when: 'Normal operation.', show: 'Any "agree" outcome.' },
      { term: 'MINORITY REPORT', badge: 'amber', short: 'Outvoted dissent',
        means: 'The model disagreed with the other two for at least 10 minutes. Its call is logged and checked against what actually happens over the next 40 minutes.',
        when: 'VISTA seeing a storm early, or a faulty model.', show: 'Presenter: "Two agree, one dissents".' },
      { term: 'Vindicated', short: 'The lone model was right',
        means: 'The weather the minority model predicted did happen. Counts in its favour.',
        when: 'Usually VISTA, ahead of an approaching storm.', show: 'Spawn a storm just west of a station and watch VISTA.' },
      { term: 'Dismissed', short: 'The lone model was wrong',
        means: 'The predicted weather never came. Three dismissals in 150 minutes lead to quarantine.',
        when: 'Faulty or corrupted models.', show: 'Corrupt a model and wait about a minute.' },
      { term: 'QUARANTINED', badge: 'grey', short: 'Switched out of the vote',
        means: 'The model no longer votes; the station decides with the other two (2-of-2). Lifted only by "Clear faults".',
        when: 'After three dismissed reports in 150 minutes.', show: 'Corrupt a model and let it be proven wrong.' },
      { term: 'CORRUPTED', badge: 'red', short: 'Broken model',
        means: 'Simulated bad software update: confident answers not based on its inputs.',
        when: 'Only when injected.', show: '"Corrupt TEMPO / VISTA / LEXIS" in the station panel.' },
      { term: 'PRESENTER', badge: 'blue', short: 'Presenter override',
        means: 'The model is temporarily forced to a call by the presenter controls (about 90 seconds).',
        when: 'Only when a presenter uses "Show it".', show: 'Presenter: any dissent, split or reject outcome.' },
    ],
  },
  {
    id: 'agreement', title: 'Agreement outcomes',
    intro: 'Shown as "Agreement" in the station panel.',
    items: [
      { term: '3/3', short: 'Unanimous', means: 'All three models agree.', when: 'Most of the time.', show: 'Presenter: "All three models agree".' },
      { term: '2/3', short: 'Majority', means: 'Two agree; the third files a minority report.', when: 'Storms arriving, faults.', show: 'Presenter: "Two agree, one dissents".' },
      { term: 'SAT TIE-BREAK', short: 'Satellite decides',
        means: 'No two models agree, so the latest satellite call picks the model it matches.', when: 'Rare: a three-way split.',
        show: 'Presenter: "Models split, satellite decides".' },
      { term: 'SPLIT', short: 'No decision',
        means: 'Three-way split and the satellite matches none: the station keeps its previous verdict and shows Caution.', when: 'Rare.',
        show: 'Presenter: "Models split" when the satellite pass is stale.' },
    ],
  },
  {
    id: 'status', title: 'Station status',
    intro: 'The badge next to the station name.',
    items: [
      { term: 'HEALTHY', badge: 'green', short: 'All normal', means: 'Online, sensors fine, models healthy, route to the BACSWN hub.', when: 'Normal operation.', show: '"Clear faults".' },
      { term: 'CAUTION', badge: 'amber', short: 'Split vote or cut off',
        means: 'The models are split, or the station has no route to the BACSWN hub in Nassau (messages are held).', when: 'Network splits, three-way disagreements.',
        show: '"Partition the south" scenario.' },
      { term: 'DEGRADED', badge: 'red', short: 'Something is broken',
        means: 'A faulty sensor, a corrupted or quarantined model, or neighbours flagged it for maintenance.', when: 'After faults.',
        show: 'Any "Stick" or "Corrupt" button, or Presenter: "Neighbours reject it".' },
      { term: 'OFFLINE', badge: 'grey', short: 'No signal', means: 'Station down; links around it fail and traffic re-routes.', when: 'Power or comms loss.',
        show: '"Take offline" in the station panel.' },
      { term: 'BACSWN HUB', badge: 'blue', short: 'Nassau gateway (MYNN)', means: 'Where confirmed alerts are sent for forecasters and aircraft.', when: 'Always MYNN.', show: 'Select Nassau on the map.' },
    ],
  },
  {
    id: 'peers', title: 'Peer verification',
    intro: 'Before an alert goes out, the station asks up to four neighbours (plus the satellite) to check.',
    items: [
      { term: 'AGREE', short: 'Neighbour sees it too', means: "The neighbour's radar/satellite sees the hazard (or one class weaker) over the station.", when: 'Real weather.', show: 'Presenter: "Neighbours confirm it".' },
      { term: 'DISAGREE', short: 'Neighbour sees nothing', means: 'The neighbour sees clear or much weaker weather.', when: 'False alarms, local sensor faults.', show: 'Presenter: "Neighbours reject it".' },
      { term: 'ABSTAIN', short: 'Neighbour cannot vote', means: 'Battery under 25%: radar on standby.', when: 'Low-power stations.', show: 'Happens naturally.' },
      { term: 'CONFIRMED', short: 'Alert sent', means: 'At least two agree and at least 60% of decided votes agree. The alert goes to the BACSWN hub.', when: 'Real hazards.', show: 'Presenter: "Neighbours confirm it".' },
      { term: 'REJECTED', short: 'Alert blocked', means: 'Outvoted. If most disagree, the station is flagged for maintenance.', when: 'False alarms.', show: 'Presenter: "Neighbours reject it", or "Stuck sensor @ Exuma".' },
      { term: 'UNVERIFIED', short: 'Nobody to ask', means: 'No neighbours reachable and the satellite cannot confirm: local alert only. (If the satellite does confirm, it counts as confirmed.)', when: 'Isolated stations.', show: '"Partition the south" scenario.' },
    ],
  },
  {
    id: 'links', title: 'Communication links',
    intro: 'How stations talk to each other and to the BACSWN hub. Also shown on the Command Center map ("Comms links").',
    items: [
      { term: 'VHF radio', line: LINK.vhf, dash: 'solid', short: 'Short range', means: 'Neighbours under about 60 nm apart. Fastest (around 10 ms).', when: 'Always on unless failed.', show: 'Command Center: Comms links ▸ VHF radio.' },
      { term: 'Cellular', line: LINK.cellular, dash: 'dashed', short: 'Medium range', means: 'About 60–108 nm, via the mobile network (around 35–50 ms).', when: 'Always on unless failed.', show: 'Command Center: Comms links ▸ Cellular.' },
      { term: 'Satellite', line: LINK.satellite, dash: 'dotted', short: 'Long range', means: 'Up to about 150 nm. Slowest (around 600 ms) but independent of the ground.', when: 'Always on unless failed.', show: 'Command Center: Comms links ▸ Satellite.' },
      { term: 'Failed link', line: LINK.down, dash: 'dashed', short: 'Link down', means: 'The link or a station at either end is down. Messages route around it.', when: 'Outages, partitions.', show: '"Take offline" or "Partition the south".' },
      { term: 'Store-and-forward', short: 'Held messages', means: 'With no route to the BACSWN hub, a station queues messages and sends them when a path reopens.', when: 'Network splits.', show: '"Partition the south" scenario.' },
      { term: 'Audit trail', short: 'Advance storm warnings', means: 'The record of each station warning the next station in a storm\'s path, with an ETA, before it arrives. Shown in the "Audit trail" log on the Mesh page.', when: 'Moving thunderstorms and squalls.', show: '"Squall line from Florida" scenario.' },
    ],
  },
  {
    id: 'faults', title: 'Sensor faults',
    intro: 'Injected from the station panel to show the network catching bad data.',
    items: [
      { term: 'Stick visibility', short: 'Fake fog', means: 'Visibility stuck at 0.5 SM: TEMPO and LEXIS report IFR, neighbours disagree.', when: 'Only when injected.', show: '"Stick visibility" or "Stuck sensor @ Exuma".' },
      { term: 'Stick wind', short: 'Fake gusts', means: 'Anemometer reports spurious 55 kt gusts.', when: 'Only when injected.', show: '"Stick wind".' },
      { term: 'Stick pressure', short: 'Barometer drift', means: 'Pressure reads 994 hPa and falling.', when: 'Only when injected.', show: '"Stick pressure".' },
      { term: 'Stick rain', short: 'Flooded gauge', means: 'Rain gauge reports 45 mm/h of rain that is not there.', when: 'Only when injected.', show: '"Stick rain".' },
    ],
  },
]

function Term({ item }) {
  const label = (
    <>
      {item.color && <i className="mg-dot" style={{ background: item.color }} aria-hidden="true" />}
      {item.line && <i className={`mg-line ${item.dash}`} style={{ borderColor: item.line }} aria-hidden="true" />}
      {item.badge ? <span className={`mbadge ${item.badge}`}>{item.term}</span> : <b>{item.term}</b>}
      <span className="mg-short">{item.short}</span>
    </>
  )
  return (
    <li>
      <HoverTip label={label} className="mg-item">
        <strong className="mg-pop-title">{item.term}</strong>
        <span className="mg-pop-row"><em>What it means</em>{item.means}</span>
        <span className="mg-pop-row"><em>When it happens</em>{item.when}</span>
        <span className="mg-pop-row"><em>How to show it</em>{item.show}</span>
      </HoverTip>
    </li>
  )
}

export default function MeshGuide() {
  return (
    <div className="mesh-guide">
      <div className="page-header">
        <div>
          <h2>Station &amp; Model Guide</h2>
          <p className="subtitle">
            Every state a mesh station and its AI models can be in. Hover over, focus or tap any item for details.
            Use the presenter controls on the <Link to="/mesh">Mesh Network</Link> page to show any of them live.
          </p>
        </div>
      </div>
      <nav className="mg-toc" aria-label="Guide sections">
        {SECTIONS.map(s => <a key={s.id} href={`#mg-${s.id}`}>{s.title}</a>)}
      </nav>
      {SECTIONS.map(s => (
        <section key={s.id} className="card mg-section" aria-labelledby={`mg-${s.id}`}>
          <h3 id={`mg-${s.id}`} tabIndex={-1}>{s.title}</h3>
          <p className="mg-intro">{s.intro}</p>
          <ul className="mg-grid">{s.items.map(i => <Term key={i.term} item={i} />)}</ul>
        </section>
      ))}
    </div>
  )
}
