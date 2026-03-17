import { Counter } from 'prom-client'
import { getRegistry } from './registry'

export function getHttpRequestsCounter(): Counter {
  const registry = getRegistry()
  const existing = registry.getSingleMetric('http_requests_total')
  if (existing) return existing as Counter
  return new Counter({
    name: 'http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'route', 'status_code'],
    registers: [registry],
  })
}
