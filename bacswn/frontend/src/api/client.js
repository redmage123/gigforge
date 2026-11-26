/**
 * BACSWN API client.
 *
 * What: one `api` object with a named method for every backend endpoint the UI
 * calls, plus `saveBlob` for browser downloads and `authHeaders` for the few
 * callers that must use `fetch` directly.
 *
 * Why: pages call `api.metars()` instead of building URLs, headers and error
 * handling themselves, so authentication, the session-expiry redirect and error
 * reporting behave the same everywhere.
 *
 * How: every JSON call goes through `request()`, which adds the bearer token,
 * sends cookies, redirects to /login on 401 (throwing AuthError) and throws
 * ApiError for any other non-success status. File downloads go through
 * `fetchBlob()`. Endpoint wrappers are thin one-liners grouped by backend router
 * (one comment per group; a JSDoc only where a wrapper is not self-explanatory).
 * Optional arguments fall back to the server's documented defaults.
 */
import { ApiError, AuthError } from './errors'

const BASE = ''
/** Marker for a response body that was not valid JSON (distinct from a JSON `null`). */
const UNPARSEABLE = Symbol('unparseable')

/**
 * Headers carrying the signed-in user's bearer token (if any).
 * @param {object} [extra] headers to include as well (the token wins on a clash)
 * @returns {object}
 */
export function authHeaders(extra = {}) {
  const token = localStorage.getItem('token')
  return token ? { ...extra, Authorization: `Bearer ${token}` } : { ...extra }
}

/** Forget the stored session and send the user to the sign-in page (unless already there). */
function endSession() {
  localStorage.removeItem('token')
  localStorage.removeItem('user')
  // The audience page (/live) works without an account, so never bounce it to the login screen.
  if (!window.location.pathname.startsWith('/login') && !window.location.pathname.startsWith('/live')) {
    window.location.href = '/login'
  }
}

/**
 * Authenticated JSON request.
 * @param {string} path API path, e.g. '/api/weather/metars'
 * @param {RequestInit} [options] fetch options; `headers` are merged with the JSON and auth headers
 * @returns {Promise<any>} the parsed JSON body
 * @throws {AuthError} on 401 (after clearing the session and redirecting to /login)
 * @throws {ApiError} on any other non-success status, or a success response that is not JSON
 */
async function request(path, options = {}) {
  const resp = await fetch(`${BASE}${path}`, {
    ...options,
    headers: authHeaders({ 'Content-Type': 'application/json', ...options.headers }),
    credentials: 'include',
  })

  if (resp.status === 401) {
    endSession()
    throw new AuthError('Authentication required')
  }

  // A proxy error page (e.g. a 502 in HTML) is not JSON: report the status, not a parser message.
  const data = await resp.json().catch(() => UNPARSEABLE)
  const body = data === UNPARSEABLE ? null : data
  if (!resp.ok) throw new ApiError(body?.error || body?.reason || `Request failed: ${resp.status}`, resp.status, body)
  if (data === UNPARSEABLE) throw new ApiError(`Unreadable response from the server (${resp.status})`, resp.status)
  return data
}

/**
 * Authenticated GET returning a Blob (CSV / JSON file exports).
 * @param {string} path
 * @returns {Promise<Blob>}
 * @throws {ApiError} on a non-success status
 */
async function fetchBlob(path) {
  const resp = await fetch(path, { headers: authHeaders(), credentials: 'include' })
  if (!resp.ok) throw new ApiError(`Export failed: ${resp.status}`, resp.status)
  return resp.blob()
}

/**
 * Authenticated POST with an optional JSON body (no body when `body` is undefined).
 * @param {string} path
 * @param {any} [body]
 * @returns {Promise<any>}
 */
const post = (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) })

/** `period=` query parameter, URL-encoded (periods look like "2024-2026"). */
const periodQ = (period) => 'period=' + encodeURIComponent(period)

/**
 * Save a Blob as a file in the browser (temporary object URL + synthetic link click).
 * @param {Blob} blob
 * @param {string} filename suggested file name
 */
export function saveBlob(blob, filename) {
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: filename })
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

/**
 * Every backend endpoint the UI uses, grouped by backend router. Each method
 * returns a Promise of the parsed JSON (or a Blob for the `*Csv`, `nerTemplate`
 * and `nerStateReport` exports) and rejects with ApiError / AuthError.
 */
export const api = {
  /** Generic GET for endpoints without a named wrapper. */
  get: (path) => request(path),
  /** Generic JSON POST for endpoints without a named wrapper. */
  post,

  // Auth: session login / registration / logout; `me` returns the signed-in user.
  login: (username, password) => post('/api/auth/login', { username, password }),
  register: (data) => post('/api/auth/register', data),
  logout: () => post('/api/auth/logout'),
  me: () => request('/api/auth/me'),

  // Dashboard
  dashboardSummary: () => request('/api/dashboard/summary'),

  // Map
  mapLayers: () => request('/api/map/layers'),

  // Weather observations (METAR / TAF) and the station list
  metars: () => request('/api/weather/metars'),
  tafs: () => request('/api/weather/tafs'),
  stations: () => request('/api/weather/stations'),

  // Flights in the Bahamas FIR
  liveFlights: () => request('/api/flights/live'),
  flightStats: () => request('/api/flights/stats'),

  // Emissions (CORSIA per-flight CO2)
  currentEmissions: () => request('/api/emissions/current'),
  emissionsSummary: () => request('/api/emissions/summary'),

  // Alerts
  activeAlerts: () => request('/api/alerts/active'),

  // Emergency: dispatch an alert to the configured channels, and the dispatch history
  dispatchAlert: (data) => post('/api/emergency/dispatch', data),
  channels: () => request('/api/emergency/channels'),
  incidents: () => request('/api/emergency/incidents'),
  dispatchLog: () => request('/api/emergency/dispatch-log'),

  // Sensors
  sensorGrid: () => request('/api/sensors/grid'),

  // SIGMET drafting
  generateSigmet: (data) => post('/api/sigmet/generate', data),
  hazardTypes: () => request('/api/sigmet/hazard-types'),

  // Training and certification
  roster: () => request('/api/training/roster'),
  trainingModules: () => request('/api/training/modules'),
  certifications: () => request('/api/training/certifications'),

  // AI agents: status, manual trigger, activity feed, and the weather-event pipeline
  agentStatus: () => request('/api/agents/status'),
  triggerAgent: (agent_name, context) => post('/api/agents/trigger', { agent_name, context }),
  agentActivity: () => request('/api/agents/activity'),
  triggerPipeline: () => post('/api/agents/pipeline/weather-event'),

  // Chat
  chat: (message) => post('/api/chat', { message }),

  // AI analysis
  analyze: (query, context_type) => post('/api/ai/analyze', { query, context_type }),

  // Channels
  channelSummary: () => request('/api/channels/summary'),

  // Hurricane operations. `category` is Saffir-Simpson (0 = tropical storm, the default);
  // `minCat` filters the historical tracks (default 1).
  hurricaneDashboard: () => request('/api/hurricane/dashboard'),
  hurricaneActive: () => request('/api/hurricane/active'),
  hurricaneSurge: (category) => request('/api/hurricane/surge/' + category),
  hurricaneShelters: (category) => request('/api/hurricane/shelters?category=' + (category || 0)),
  hurricaneAirports: (category) => request('/api/hurricane/airports?category=' + (category || 0)),
  hurricaneEvacuation: () => request('/api/hurricane/evacuation'),
  hurricaneHistorical: (minCat) => request('/api/hurricane/historical?min_category=' + (minCat || 1)),
  hurricaneCompare: () => request('/api/hurricane/compare'),
  coastalReplay: () => request('/api/hurricane/coastal-replay'),
  /** Raise a Saffir-Simpson escalation alert for the storm; the server dispatches it to every channel. */
  hurricaneEscalate: (category, name) => post('/api/hurricane/escalate?category=' + category + '&storm_name=' + encodeURIComponent(name)),

  // Mesh network simulation: state, presenter controls (fault / storm / present / scenario),
  // guided-story beats, and the AI "ask about this step" helper.
  meshStatus: () => request('/api/mesh/status'),
  meshNode: (id) => request('/api/mesh/node/' + id),
  meshAirspace: () => request('/api/mesh/airspace'),
  /** Real current conditions at a station from Tomorrow.io (not part of the simulation). */
  meshLiveWeather: (id) => request('/api/mesh/node/' + id + '/live-weather'),
  /** Ask a station's neighbours to verify its verdict (default station MYNN). */
  meshConsensus: (station) => post('/api/mesh/consensus?station=' + (station || 'MYNN')),
  meshFault: (fault) => post('/api/mesh/fault', fault),
  meshStorm: (storm) => post('/api/mesh/storm', storm),
  meshPresent: (p) => post('/api/mesh/present', p),
  meshScenario: (name) => post('/api/mesh/scenario/' + name),
  /** Stage one beat of a guided story; the server then holds the mesh still. */
  meshStory: (story, beat) => post('/api/mesh/story', { story, beat }),
  /** Release a story's hold and reset the mesh. */
  meshStoryEnd: () => post('/api/mesh/story/end'),
  meshAsk: (body) => post('/api/mesh/ask', body),
  /** Whether the AI assistant is configured on the server (`{ configured }`). */
  aiStatus: () => request('/api/ai/assist-status'),

  // CORSIA oversight register (state-side verification of aircraft operators)
  oversightPeriods: () => request('/api/carbon-oversight/periods'),
  oversightRegister: (period) => request('/api/carbon-oversight/register?' + periodQ(period)),
  oversightOperator: (id) => request('/api/carbon-oversight/operators/' + id),
  oversightCreateOperator: (data) => post('/api/carbon-oversight/operators', data),
  oversightAddReport: (id, data) => post('/api/carbon-oversight/operators/' + id + '/reports', data),
  oversightAddClaim: (id, data) => post('/api/carbon-oversight/operators/' + id + '/claims', data),
  oversightReview: (claimId, data) => post('/api/carbon-oversight/claims/' + claimId + '/review', data),
  oversightCsv: (period) => fetchBlob('/api/carbon-oversight/register.csv?' + periodQ(period)),
  oversightAddFuelClaim: (id, data) => post('/api/carbon-oversight/operators/' + id + '/fuel-claims', data),
  oversightReviewFuel: (claimId, data) => post('/api/carbon-oversight/fuel-claims/' + claimId + '/review', data),
  /** AI-read a proof-of-sustainability document into fuel-claim form fields (records nothing). */
  oversightReadCertificate: (id, body) => post('/api/carbon-oversight/operators/' + id + '/fuel-certificate', body),
  oversightFuelCsv: (period) => fetchBlob('/api/carbon-oversight/fuel-claims.csv?' + periodQ(period)),

  // Bahamas National Emissions Registry (it has no API: statements are exchanged as files)
  nerStatus: () => request('/api/carbon-oversight/ner/status'),
  nerStatements: () => request('/api/carbon-oversight/ner/statements'),
  nerImport: (body) => post('/api/carbon-oversight/ner/statements', body),
  nerTemplate: () => fetchBlob('/api/carbon-oversight/ner/template.csv'),
  nerAuthorisations: () => request('/api/carbon-oversight/ner/authorisations'),
  nerAddAuthorisation: (data) => post('/api/carbon-oversight/ner/authorisations', data),

  // AI assistance for the register (drafts and pre-filled forms only; nothing is recorded)
  /** AI-read an uploaded document; `kind` is report | cancellation | authorisation | statement. */
  oversightAiRead: (kind, body) => post('/api/carbon-oversight/ai/read/' + kind, body),
  oversightAiBrief: (body) => post('/api/carbon-oversight/ai/review-brief', body),
  oversightAiRules: (body) => post('/api/carbon-oversight/ai/rules-check', body),
  oversightAiAsk: (question) => post('/api/carbon-oversight/ai/ask', { question }),
  oversightAiExplain: (period, finding) => post('/api/carbon-oversight/ai/explain', { period, finding }),
  oversightAiDraft: (body) => post('/api/carbon-oversight/ai/draft', body),
  /** The state report for the registry, as a downloadable JSON Blob. */
  nerStateReport: (period) => fetchBlob('/api/carbon-oversight/ner/state-report?' + periodQ(period)),

  // Weather-benefit ledger (fuel / CO2 saved by early storm warnings); `days` defaults to 30
  weatherBenefit: (days) => request('/api/emissions/weather-benefit?days=' + (days || 30)),
  weatherBenefitCsv: (days) => fetchBlob('/api/emissions/weather-benefit.csv?days=' + (days || 30)),

  // Simulations
  simulationScenarios: () => request('/api/simulation/scenarios'),
  simulationRun: (id, step) => request('/api/simulation/run/' + id + '?step=' + step),

  // Forecast verification; `windowHours` defaults to 168 (one week)
  verificationScoreboard: (windowHours) => request('/api/verification/scoreboard?window_hours=' + (windowHours || 168)),
  verificationStations: (windowHours) => request('/api/verification/stations?window_hours=' + (windowHours || 168)),
  verificationWarnings: (windowHours) => request('/api/verification/warnings?window_hours=' + (windowHours || 168)),
  verificationStation: (id, windowHours) => request('/api/verification/station/' + id + '?window_hours=' + (windowHours || 168)),

  // Climatology (ERA5 30-year normals); every station when `station` is omitted
  climatologyNormals: (station) => request('/api/climatology/normals' + (station ? '?station=' + station : '')),

  // Operations briefing and verification detail
  briefing: () => request('/api/verification/briefing'),
  /** Forecast-vs-observed series (defaults: MYNN, temp_c, 6 h lead). */
  verificationTimeseries: (station, variable, leadH) =>
    request('/api/verification/timeseries?station=' + (station || 'MYNN') + '&variable=' + (variable || 'temp_c') + '&lead_h=' + (leadH || 6)),
  verificationMeta: () => request('/api/verification/meta'),
  /** Raw vs bias-corrected (MOS) forecast accuracy. The server serves a precomputed result and ignores `window_hours`. */
  verificationCorrection: (windowHours) => request('/api/verification/correction?window_hours=' + (windowHours || 720)),
  /** Run a forecast capture + match cycle now (admin / supervisor). */
  verificationCapture: () => post('/api/verification/capture'),
  /** Backfill the scoreboard from reanalysis for `days` days (default 7, server caps at 30; admin / supervisor). */
  verificationBackfill: (days) => post('/api/verification/backfill?days=' + (days || 7)),
}
