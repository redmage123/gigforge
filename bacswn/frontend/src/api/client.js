/* BACSWN API Client */

const BASE = ''

async function request(path, options = {}) {
  const token = localStorage.getItem('token')
  const headers = { 'Content-Type': 'application/json', ...options.headers }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const resp = await fetch(`${BASE}${path}`, {
    ...options,
    headers,
    credentials: 'include',
  })

  if (resp.status === 401) {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    if (!window.location.pathname.startsWith('/login')) {
      window.location.href = '/login'
    }
    throw new Error('Authentication required')
  }

  const data = await resp.json()
  if (!resp.ok) throw new Error(data.error || `Request failed: ${resp.status}`)
  return data
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) }),

  // Auth
  login: (username, password) => request('/api/auth/login', {
    method: 'POST', body: JSON.stringify({ username, password }),
  }),
  register: (data) => request('/api/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  logout: () => request('/api/auth/logout', { method: 'POST' }),
  me: () => request('/api/auth/me'),

  // Dashboard
  dashboardSummary: () => request('/api/dashboard/summary'),

  // Map
  mapLayers: () => request('/api/map/layers'),

  // Weather
  metars: () => request('/api/weather/metars'),
  tafs: () => request('/api/weather/tafs'),
  stations: () => request('/api/weather/stations'),

  // Flights
  liveFlights: () => request('/api/flights/live'),
  flightStats: () => request('/api/flights/stats'),

  // Emissions
  currentEmissions: () => request('/api/emissions/current'),
  emissionsSummary: () => request('/api/emissions/summary'),

  // Alerts
  activeAlerts: () => request('/api/alerts/active'),

  // Emergency
  dispatchAlert: (data) => request('/api/emergency/dispatch', { method: 'POST', body: JSON.stringify(data) }),
  channels: () => request('/api/emergency/channels'),
  incidents: () => request('/api/emergency/incidents'),
  dispatchLog: () => request('/api/emergency/dispatch-log'),

  // Sensors
  sensorGrid: () => request('/api/sensors/grid'),

  // SIGMET
  generateSigmet: (data) => request('/api/sigmet/generate', { method: 'POST', body: JSON.stringify(data) }),
  hazardTypes: () => request('/api/sigmet/hazard-types'),

  // Training
  roster: () => request('/api/training/roster'),
  trainingModules: () => request('/api/training/modules'),
  certifications: () => request('/api/training/certifications'),

  // Agents
  agentStatus: () => request('/api/agents/status'),
  triggerAgent: (agent_name, context) => request('/api/agents/trigger', {
    method: 'POST', body: JSON.stringify({ agent_name, context }),
  }),
  agentActivity: () => request('/api/agents/activity'),
  triggerPipeline: () => request('/api/agents/pipeline/weather-event', { method: 'POST' }),

  // Chat
  chat: (message) => request('/api/chat', { method: 'POST', body: JSON.stringify({ message }) }),

  // AI
  analyze: (query, context_type) => request('/api/ai/analyze', {
    method: 'POST', body: JSON.stringify({ query, context_type }),
  }),

  // Channels
  channelSummary: () => request('/api/channels/summary'),

  // Hurricane Operations
  hurricaneDashboard: () => request('/api/hurricane/dashboard'),
  hurricaneActive: () => request('/api/hurricane/active'),
  hurricaneSurge: (category) => request('/api/hurricane/surge/' + category),
  hurricaneShelters: (category) => request('/api/hurricane/shelters?category=' + (category || 0)),
  hurricaneAirports: (category) => request('/api/hurricane/airports?category=' + (category || 0)),
  hurricaneEvacuation: () => request('/api/hurricane/evacuation'),
  hurricaneHistorical: (minCat) => request('/api/hurricane/historical?min_category=' + (minCat || 1)),
  hurricaneCompare: () => request('/api/hurricane/compare'),
  hurricaneEscalate: (category, name) => request('/api/hurricane/escalate?category=' + category + '&storm_name=' + encodeURIComponent(name), { method: 'POST' }),

  // Mesh Network
  meshStatus: () => request('/api/mesh/status'),
  meshNode: (id) => request('/api/mesh/node/' + id),
  meshConsensus: (type) => request('/api/mesh/consensus?event_type=' + (type || 'weather_alert'), { method: 'POST' }),

  // Simulations
  simulationScenarios: () => request('/api/simulation/scenarios'),
  simulationRun: (id, step) => request('/api/simulation/run/' + id + '?step=' + step),
}
