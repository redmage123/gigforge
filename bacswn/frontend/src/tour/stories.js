import { api } from '../api/client'
import { emitTour } from './bus'

/**
 * Guided stories: short, focused walk-throughs that drive the live mesh.
 * Each step's action asks the server to stage one beat (POST /api/mesh/story):
 * the server sets the scene with the ordinary mechanisms, runs the simulation
 * the few ticks they need, then holds the mesh still, so what is on screen
 * matches the caption however long it is discussed. Ending a story releases
 * the hold and resets the mesh (onEnd).
 */
const beat = (story, b) => api.meshStory(story, b)
const station = (s) => emitTour('mesh-select', { station: s })
const tab = (t) => emitTour('mesh-tab', { tab: t })
// Traffic tab without the constant keepalives, so the alert / ticket the caption names is on top.
const traffic = () => { tab('traffic'); setTimeout(() => emitTour('mesh-heartbeats', { show: false }), 50) }
const LOG = '#mesh-tabpanel'

const SQUALL = [
  {
    id: 'sq-1', path: '/mesh', title: 'A squall line heads for Abaco', seconds: 16, settleMs: 1200,
    target: '.mesh-main',
    action: async () => { await beat('squall', 'start'); station('MYAT'); tab('stations') },
    body: [
      'A squall line is crossing from the north-west towards Treasure Cay (MYAT), with Marsh Harbour (MYAM) 22 nautical miles further down its track.',
      'For now both report clear skies. The mesh is held still at each step of this story, so take as long as you need.',
    ],
  },
  {
    id: 'sq-2', path: '/mesh', title: 'VISTA sees it first', seconds: 20, settleMs: 1500,
    target: '.chamber',
    action: async () => { await beat('squall', 'vista'); station('MYAT') },
    body: [
      'The squall is about 10 to 15 minutes away. VISTA, which reads radar and satellite and looks 30 minutes ahead, already calls SQUALL. TEMPO (the station’s own sensors) and LEXIS (weather reports) still see clear skies.',
      'Two models outvote one, so the station stays at CLEAR. VISTA is not ignored: it files a minority report, which is kept and checked against what actually happens.',
    ],
  },
  {
    id: 'sq-3', path: '/mesh', title: 'The others catch up, and VISTA is proved right', seconds: 18, settleMs: 1500,
    target: '.chamber',
    action: async () => { await beat('squall', 'arrive'); station('MYAT') },
    body: [
      'The squall reaches Treasure Cay. TEMPO feels the gusts and the pressure jump, and LEXIS reads it in the weather report: all three models now agree on SQUALL.',
      'VISTA’s minority report is marked vindicated: it saw the storm before the others could.',
    ],
  },
  {
    id: 'sq-4', path: '/mesh', title: 'The neighbours check it', seconds: 16,
    target: LOG,
    action: async () => { station('MYAT'); tab('consensus') },
    body: [
      'Before the alert goes anywhere, Treasure Cay asks its nearest neighbours to verify it with their own radar. They see the squall too, so the alert is confirmed.',
      'One station on its own can never raise a network alert.',
    ],
  },
  {
    id: 'sq-5', path: '/mesh', title: 'The alert reaches the BACSWN hub', seconds: 14,
    target: LOG,
    action: async () => { traffic() },
    body: [
      'The confirmed alert travels over the mesh to the BACSWN hub in Nassau on the fastest available path. The Mesh traffic log shows the route it took.',
    ],
  },
  {
    id: 'sq-6', path: '/mesh', title: 'Marsh Harbour is warned before the storm arrives', seconds: 20, settleMs: 1500,
    target: LOG,
    action: async () => { await beat('squall', 'handoff'); station('MYAM'); tab('propagation') },
    body: [
      'Treasure Cay passes a storm warning down the squall’s track to Marsh Harbour, with its expected arrival time. The Audit trail records the hand-off.',
      'Marsh Harbour acts on it before its own sensors feel anything: VISTA and LEXIS call SQUALL ahead of time. Its neighbours can see the storm on its way, so they confirm the early warning instead of treating it as a fault.',
    ],
  },
]

const STUCK = [
  {
    id: 'ss-1', path: '/mesh', title: 'Exuma on a clear day', seconds: 14, settleMs: 1200,
    target: '.chamber',
    action: async () => { await beat('stuck_sensor', 'start'); station('MYEG'); tab('stations') },
    body: [
      'Exuma International (MYEG) reports clear skies. All three of its models agree, and its neighbours see the same.',
    ],
  },
  {
    id: 'ss-2', path: '/mesh', title: 'A sensor sticks', seconds: 20, settleMs: 1500,
    target: '.chamber',
    action: async () => { await beat('stuck_sensor', 'fault'); station('MYEG') },
    body: [
      'Exuma’s visibility sensor has stuck at half a mile. TEMPO reads the sensor and LEXIS reads the report built from it, so both call IFR (fog or low cloud). Two of three: the station believes it.',
      'VISTA, looking at radar and satellite instead, still sees clear skies and files a minority report.',
    ],
  },
  {
    id: 'ss-3', path: '/mesh', title: 'The neighbours say no', seconds: 18,
    target: LOG,
    action: async () => { station('MYEG'); tab('consensus') },
    body: [
      'Exuma asks its neighbours to verify the fog. Their radar, and the satellite, see clear air over Exuma: every vote is DISAGREE, so the alert is rejected.',
      'No false alarm reaches the BACSWN hub, forecasters or aircraft.',
    ],
  },
  {
    id: 'ss-4', path: '/mesh', title: 'A maintenance ticket, automatically', seconds: 16,
    target: LOG,
    action: async () => { traffic() },
    body: [
      'Because the neighbours contradict Exuma’s own sensors, the station is marked as degraded and a maintenance ticket goes to the hub instead of an alert. Engineers know which station to visit, and why.',
    ],
  },
  {
    id: 'ss-5', path: '/mesh', title: 'Repaired', seconds: 0, settleMs: 1200,
    target: '.chamber',
    action: async () => { await beat('stuck_sensor', 'repair'); station('MYEG'); tab('stations') },
    body: [
      'Once the sensor is fixed, Exuma is back to clear skies with all three models in agreement. Finishing the story resets the mesh for the next demo.',
    ],
  },
]

const CUT_OFF = [
  {
    id: 'co-1', path: '/mesh', title: 'The southern islands', seconds: 14, settleMs: 1200,
    target: '.mesh-main',
    action: async () => { await beat('cut_off', 'start'); station('MYIG'); tab('links') },
    body: [
      'Inagua (MYIG) is the southernmost station, often the first to meet an Atlantic storm. Today its messages reach the BACSWN hub in Nassau by way of Ragged Island, Exuma and Andros.',
    ],
  },
  {
    id: 'co-2', path: '/mesh', title: 'Cut off', seconds: 18, settleMs: 1200,
    target: LOG,
    action: async () => { await beat('cut_off', 'cut'); station('MYIG'); tab('links') },
    body: [
      'Every link between the southern stations (Inagua, Mayaguana and Ragged Island) and the rest of the network has failed. There is no route to the hub.',
      'The three stations can still talk to each other.',
    ],
  },
  {
    id: 'co-3', path: '/mesh', title: 'A storm hits, and Inagua keeps working', seconds: 20, settleMs: 1500,
    target: '.chamber',
    action: async () => { await beat('cut_off', 'storm'); station('MYIG'); tab('consensus') },
    body: [
      'A thunderstorm builds over Inagua. Its models agree on TSRA, and Mayaguana and Ragged Island confirm it with their radar. Being cut off does not stop the station sensing, deciding or verifying.',
    ],
  },
  {
    id: 'co-4', path: '/mesh', title: 'Alerts wait in a queue', seconds: 16,
    target: LOG,
    action: async () => { station('MYIG'); tab('events') },
    body: [
      'With no path to the hub, Inagua’s confirmed alerts are held in its store-and-forward queue. The Event log shows each one being queued; nothing is lost.',
    ],
  },
  {
    id: 'co-5', path: '/mesh', title: 'Links return: the alerts go through', seconds: 0, settleMs: 1500,
    target: LOG,
    action: async () => { await beat('cut_off', 'restore'); station('MYIG'); traffic() },
    body: [
      'The links come back and the queued alerts are delivered to the hub at once, each marked with how long it waited. Finishing the story resets the mesh for the next demo.',
    ],
  },
]

const RADIO = [
  {
    id: 'ra-1', path: '/mesh', title: 'Chub Cay on a normal day', seconds: 16, settleMs: 1200,
    target: '.station-dashboard',
    action: async () => { await beat('radio', 'start'); station('MYBC'); tab('links') },
    body: [
      'Chub Cay (MYBC) has two ways to talk: VHF radio and a satellite terminal. It has no cellular or wired line. Its VHF link to the BACSWN hub in Nassau, 32 nautical miles away, takes about 14 milliseconds.',
      'The Communications panel shows its equipment, and the Links log shows the channel every link is using.',
    ],
  },
  {
    id: 'ra-2', path: '/mesh', title: 'A squall brings the mast down', seconds: 20, settleMs: 1500,
    target: '.station-dashboard',
    action: async () => { await beat('radio', 'storm'); station('MYBC'); tab('links') },
    body: [
      'A squall parks over Chub Cay and its gusts bring down the VHF mast. Within one cycle every Chub Cay link is on satellite.',
      'Messages to Nassau now take about 600 milliseconds instead of 14, but Chub Cay never loses contact: its votes, alerts and heartbeats still get through.',
    ],
  },
  {
    id: 'ra-3', path: '/mesh', title: 'The event log records it', seconds: 14,
    target: LOG,
    action: async () => { station('MYBC'); tab('events') },
    body: [
      'The Event log shows the cause (the mast, and the gust speed that brought it down) and the link’s switch to satellite, so engineers know what to repair before anyone reaches the island.',
    ],
  },
  {
    id: 'ra-4', path: '/mesh', title: 'Repaired, but not trusted yet', seconds: 18, settleMs: 1500,
    target: '.station-dashboard',
    action: async () => { await beat('radio', 'repair'); station('MYBC'); tab('links') },
    body: [
      'The field team puts the mast back up and VHF works again. The link to Nassau does not switch straight back: it waits for 30 minutes of stable signal, so a radio that is still flickering cannot make it flip back and forth.',
    ],
  },
  {
    id: 'ra-5', path: '/mesh', title: 'Back on VHF', seconds: 0, settleMs: 1500,
    target: '.station-dashboard',
    action: async () => { await beat('radio', 'failback'); station('MYBC'); tab('events') },
    body: [
      'After 30 stable minutes the link switches back to VHF and messages are fast again. Every step, from the damage to the switch back, is in the Event log. Finishing the story resets the mesh for the next demo.',
    ],
  },
]

export const STORIES = [
  { id: 'squall', title: 'How a squall line is caught', minutes: 2, steps: SQUALL,
    summary: 'VISTA sees the storm first, the other models catch up, neighbours confirm, the hub is alerted and the next station is warned.' },
  { id: 'stuck_sensor', title: 'A stuck sensor is rejected', minutes: 2, steps: STUCK,
    summary: 'A faulty sensor fools two models, but the neighbours’ radar disagrees: no false alarm, and a maintenance ticket instead.' },
  { id: 'radio', title: 'A storm takes out the radio', minutes: 2, steps: RADIO,
    summary: 'A squall brings down Chub Cay’s VHF mast: its links switch to satellite, stay connected, and switch back once the repaired radio is stable.' },
  { id: 'cut_off', title: 'Cut off from the hub', minutes: 2, steps: CUT_OFF,
    summary: 'The southern islands lose every link, keep working through a storm, queue their alerts and deliver them when links return.' },
]

export const storyById = (id) => STORIES.find(s => s.id === id)
export const STORY_EVENT = 'bacswn:play-story'
export const playStory = (id) => window.dispatchEvent(new CustomEvent(STORY_EVENT, { detail: { id } }))
