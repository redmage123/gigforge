import { Histogram } from 'prom-client'
import { getRegistry } from './registry'

export function getRequestDurationHistogram(): Histogram {
  const registry = getRegistry()
  const existing = registry.getSingleMetric('http_request_duration_seconds')
  if (existing) return existing as Histogram
  return new Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [registry],
  })
}
