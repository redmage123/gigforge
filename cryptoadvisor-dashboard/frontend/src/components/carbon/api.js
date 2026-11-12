import { api } from '../../api/client'

/** Carbon Desk endpoints (simulated CME-style carbon-offset futures). */
const B = '/api/carbon-desk'
export const desk = {
  specs: () => api.get(`${B}/specs`),
  candles: (symbol, minutes) => api.get(`${B}/candles/${encodeURIComponent(symbol)}?minutes=${minutes || 1}&limit=240`),
  account: () => api.get(`${B}/account`),
  submit: (order) => api.post(`${B}/orders`, order),
  cancel: (id) => api.del(`${B}/orders/${id}`),
  cancelAll: (symbol) => api.post(`${B}/orders/cancel-all${symbol ? `?symbol=${encodeURIComponent(symbol)}` : ''}`, {}),
  flatten: (symbol) => api.post(`${B}/positions/${encodeURIComponent(symbol)}/flatten`, {}),
  obligation: () => api.get(`${B}/corsia-obligation`),
  setObligation: (annualCo2Tonnes) => api.put(`${B}/corsia-obligation`, { annual_co2_tonnes: annualCo2Tonnes }),
  advisorIdeas: () => api.get(`${B}/advisor/ideas`),
  advisorAsk: (message) => api.post(`${B}/advisor/chat`, { message }),
  advisorReset: () => api.post(`${B}/advisor/reset`, {}),
}
