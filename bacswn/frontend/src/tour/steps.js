import { api } from '../api/client'
import { emitTour } from './bus'

/**
 * The guided demo script. Each step opens a page, optionally does something
 * (`action`), then highlights `target` and shows the caption. `seconds` is how
 * long auto-advance waits on the step. Mesh scenarios run on the shared
 * simulation (1 real second = 5 simulated minutes), so they keep developing
 * while the caption is read.
 */
const meshStation = (station) => emitTour('mesh-select', { station })
const meshTab = (tab) => emitTour('mesh-tab', { tab })
// settleMs: pause after the action so the live simulation (polled every 1.5 s)
// already shows what the caption describes when it appears.

export const TOUR_STEPS = [
  {
    id: 'welcome', path: '/', title: 'Welcome to SkyWatch Bahamas', seconds: 14,
    target: '.page-header',
    body: [
      'SkyWatch gives the Bahamas Department of Meteorology and air traffic control one live picture of weather, airspace and climate obligations.',
      'This tour takes about six minutes and drives the demo for you. Use Next and Back, or turn on Auto-advance.',
    ],
  },
  {
    id: 'command', path: '/', title: 'Command Center: the live picture', seconds: 16,
    target: '.leaflet-container',
    body: [
      'Aircraft in the Bahamas FIR, flight conditions at every station, SIGMETs and tropical cyclones on one map.',
      'Alerts arrive with sound and a visual pulse that users can switch off, and the weather briefing can be read aloud. Everything on the map is also available as text tables below it.',
    ],
  },
  {
    id: 'mesh', path: '/mesh', title: 'A self-healing mesh of AI stations', seconds: 16,
    target: '.mesh-main',
    action: async () => { await api.meshScenario('reset'); meshStation('MYNN'); meshTab('stations') },
    body: [
      'Fifteen radar and weather stations form a mesh: if a link or a station fails, traffic reroutes automatically.',
      'Every station runs three independent AI models — TEMPO on its own sensors, VISTA on radar and satellite, LEXIS on reports and climatology. Two of the three must agree before the station acts.',
    ],
  },
  {
    id: 'squall', path: '/mesh', settleMs: 3000, title: 'A squall line arrives from Florida', seconds: 20,
    target: '.mesh-main',
    action: async () => { await api.meshScenario('squall_line'); meshStation('MYGF'); meshTab('propagation') },
    body: [
      'Three squall cells are sweeping south-east across Grand Bahama, Abaco and Nassau.',
      'Watch the Hand-offs log: upstream stations warn the stations in the storm’s path before it reaches them, so downstream verdicts change ahead of the weather.',
    ],
  },
  {
    id: 'dashboard', path: '/mesh', title: 'Ground sensors and Tomorrow.io satellite input', seconds: 18,
    target: '.station-dashboard',
    action: async () => { meshStation('MYNN') },
    body: [
      'Each station hubs its own sensor network — anemometer, barometer, rain gauge, lightning detector, tide gauge and two remote outstations that see weather arrive first.',
      'Simulated Tomorrow.io satellite passes add a wide-area view: they break ties between the models, vote when a hazard is verified and cross-check local sensors.',
    ],
  },
  {
    id: 'sensor', path: '/mesh', settleMs: 6000, title: 'A stuck sensor is caught, not believed', seconds: 18,
    target: '.chamber',
    action: async () => { await api.meshScenario('reset'); await api.meshScenario('sensor_fault'); meshStation('MYEG'); meshTab('consensus') },
    body: [
      'Exuma’s visibility sensor has stuck at half a mile. Two of its own models are fooled and call IFR.',
      'Neighbouring stations check with their own radar — joined by the satellite once its next pass arrives — and see no fog: the alert is rejected and a maintenance ticket is raised. No false alarm reaches Nassau.',
    ],
  },
  {
    id: 'rogue', path: '/mesh', settleMs: 5000, title: 'A faulty AI model is outvoted, then quarantined', seconds: 20,
    target: '.chamber',
    action: async () => { await api.meshScenario('reset'); await api.meshScenario('rogue_precog'); meshStation('MYNN'); meshTab('minority') },
    body: [
      'Nassau’s LEXIS model has been corrupted and is producing nonsense with high confidence.',
      'The other two models outvote it. Its dissents are filed as minority reports and scored against what actually happens; once they keep being proven wrong, it is quarantined and the station carries on two-of-two.',
    ],
  },
  {
    id: 'partition', path: '/mesh', settleMs: 3000, title: 'Cut off, but not silenced', seconds: 18,
    target: '.mesh-main',
    action: async () => { await api.meshScenario('reset'); await api.meshScenario('partition'); meshStation('MYIG'); meshTab('links') },
    body: [
      'Inagua, Mayaguana and Ragged Island have lost every link to the rest of the network.',
      'Their alerts wait in a store-and-forward queue and go out the moment a path returns — and the satellite can still verify a hazard on its own.',
    ],
  },
  {
    id: 'carbon-desk', path: '/carbon-trading', title: 'Carbon Desk: offset futures', seconds: 16,
    target: '.tt-area-ladder',
    body: [
      'A trading screen for carbon-offset futures modelled on CME’s GEO, N-GEO and C-GEO contracts: depth of market, one-click orders, positions and risk checks.',
      'The market is simulated — it is not connected to CME — and accounts and orders persist across restarts.',
    ],
  },
  {
    id: 'oversight', path: '/corsia-oversight', title: 'CORSIA oversight: the state’s view', seconds: 18,
    target: '.co-findings',
    body: [
      'Under CORSIA, airlines buy and cancel carbon credits; the Bahamas verifies their reports and claims. This register records both, and nothing in it can be edited or deleted.',
      'Problems are flagged automatically — here, units already claimed by another airline, ineligible units and missing reports.',
    ],
  },
  {
    id: 'hurricane', path: '/hurricane', title: 'Hurricane operations', seconds: 16,
    target: '.leaflet-container',
    body: [
      'Storm track and forecast cone, wind-field rings, storm surge, evacuation zones, shelters and airport status in one view.',
      'The scenario planner shows what each category means for surge and evacuation, and escalation dispatches alerts to 42 channels.',
    ],
  },
  {
    id: 'agents', path: '/agents', title: 'Seven autonomous agents', seconds: 18,
    target: '[aria-label="Pipeline diagram (scrolls sideways)"]',
    action: async () => { emitTour('agents-demo') },
    body: [
      'Behind the screens, seven agents watch the weather, track flights, draft SIGMETs, calculate emissions, check data quality and dispatch alerts.',
      'A demo run is playing now: watch the hand-off from one agent to the next in the activity feed.',
    ],
  },
  {
    id: 'end', path: '/mesh', title: 'That’s SkyWatch', seconds: 0,
    target: '.mesh-main',
    action: async () => { await api.meshScenario('reset'); meshStation('MYNN'); meshTab('stations') },
    body: [
      'One platform for observing, deciding and acting — built to keep working when links, sensors or models fail.',
      'Every page works with a keyboard and screen reader, in light or dark themes, at any screen size. The mesh simulation has been reset for the next demo.',
    ],
  },
]
