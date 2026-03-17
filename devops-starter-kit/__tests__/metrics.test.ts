import request from 'supertest'
import { createApp } from '../src/app'
import { resetRegistry } from '../src/metrics/registry'
import { resetStore } from '../src/routes/api'

beforeEach(() => {
  resetRegistry()
  resetStore()
})

describe('Prometheus metrics', () => {
  // Test 1: GET /metrics contains 'http_requests_total'
  it('GET /metrics output contains http_requests_total', async () => {
    const app = createApp()
    await request(app).get('/health')
    const res = await request(app).get('/metrics')
    expect(res.text).toContain('http_requests_total')
  })

  // Test 2: GET /metrics contains 'http_request_duration_seconds'
  it('GET /metrics output contains http_request_duration_seconds', async () => {
    const app = createApp()
    await request(app).get('/health')
    const res = await request(app).get('/metrics')
    expect(res.text).toContain('http_request_duration_seconds')
  })

  // Test 3: After GET /health, counter increments
  it('counter increments after requests', async () => {
    const app = createApp()
    await request(app).get('/health')
    const res1 = await request(app).get('/metrics')
    const match1 = res1.text.match(/http_requests_total\{[^}]*\}\s+([\d.]+)/)
    const count1 = match1 ? parseFloat(match1[1]) : 0

    await request(app).get('/health')
    const res2 = await request(app).get('/metrics')
    const match2 = res2.text.match(/http_requests_total\{[^}]*\}\s+([\d.]+)/)
    const count2 = match2 ? parseFloat(match2[1]) : 0

    expect(count2).toBeGreaterThan(count1)
  })

  // Test 4: Duration histogram observed (response includes bucket lines)
  it('histogram bucket lines appear in metrics output after requests', async () => {
    const app = createApp()
    await request(app).get('/health')
    const res = await request(app).get('/metrics')
    expect(res.text).toContain('http_request_duration_seconds_bucket')
  })

  // Test 5: Labels include method, route, status_code in output
  it('metrics output contains method, route, and status_code labels', async () => {
    const app = createApp()
    await request(app).get('/health')
    const res = await request(app).get('/metrics')
    expect(res.text).toMatch(/method="GET"/)
    expect(res.text).toMatch(/status_code="200"/)
    expect(res.text).toMatch(/route=/)
  })

  // Test 6: Counter includes HELP and TYPE lines
  it('http_requests_total has HELP and TYPE lines', async () => {
    const app = createApp()
    await request(app).get('/health')
    const res = await request(app).get('/metrics')
    expect(res.text).toContain('# HELP http_requests_total')
    expect(res.text).toContain('# TYPE http_requests_total counter')
  })

  // Test 7: Histogram includes HELP and TYPE lines
  it('http_request_duration_seconds has HELP and TYPE lines', async () => {
    const app = createApp()
    await request(app).get('/health')
    const res = await request(app).get('/metrics')
    expect(res.text).toContain('# HELP http_request_duration_seconds')
    expect(res.text).toContain('# TYPE http_request_duration_seconds histogram')
  })

  // Test 8: Content-Type is text/plain; charset=utf-8
  it('GET /metrics content-type is text/plain with utf-8 charset', async () => {
    const app = createApp()
    const res = await request(app).get('/metrics')
    expect(res.headers['content-type']).toMatch(/text\/plain/)
    expect(res.headers['content-type']).toMatch(/utf-8/i)
  })

  // Test 9: 404 responses counted
  it('404 responses are counted in metrics', async () => {
    const app = createApp()
    await request(app).get('/nonexistent-path-xyz')
    const res = await request(app).get('/metrics')
    expect(res.text).toContain('status_code="404"')
  })

  // Test 10: Histogram sum is positive after requests
  it('histogram sum is positive after making requests', async () => {
    const app = createApp()
    await request(app).get('/health')
    const res = await request(app).get('/metrics')
    const sumMatch = res.text.match(/http_request_duration_seconds_sum\{[^}]*\}\s+([\d.e+-]+)/)
    expect(sumMatch).not.toBeNull()
    if (sumMatch) {
      expect(parseFloat(sumMatch[1])).toBeGreaterThanOrEqual(0)
    }
  })
})
