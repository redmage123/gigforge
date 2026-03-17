import request from 'supertest'
import { createApp } from '../src/app'
import { resetStore } from '../src/routes/api'
import { resetRegistry } from '../src/metrics/registry'

const app = createApp()

beforeEach(() => {
  resetStore()
  resetRegistry()
})

describe('API endpoints', () => {
  // Test 1: GET /health → 200 { status: 'ok', timestamp: ... }
  it('GET /health returns 200 with status ok and timestamp', async () => {
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ok')
    expect(typeof res.body.timestamp).toBe('string')
  })

  // Test 2: GET /health returns uptime field
  it('GET /health includes uptime in response', async () => {
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
    expect(typeof res.body.uptime).toBe('number')
  })

  // Test 3: GET /metrics → 200 text/plain
  it('GET /metrics returns 200 with text/plain content type', async () => {
    const res = await request(app).get('/metrics')
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/text\/plain/)
  })

  // Test 4: POST /api/items { name: 'test' } → 201
  it('POST /api/items creates item and returns 201', async () => {
    const res = await request(app)
      .post('/api/items')
      .send({ name: 'test' })
      .set('Content-Type', 'application/json')
    expect(res.status).toBe(201)
    expect(res.body.name).toBe('test')
    expect(typeof res.body.id).toBe('number')
    expect(typeof res.body.createdAt).toBe('string')
  })

  // Test 5: GET /api/items → 200 array
  it('GET /api/items returns 200 with array', async () => {
    await request(app)
      .post('/api/items')
      .send({ name: 'item1' })
      .set('Content-Type', 'application/json')
    const res = await request(app).get('/api/items')
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body.length).toBe(1)
  })

  // Test 6: GET /api/items/:id → 200 item
  it('GET /api/items/:id returns 200 with the item', async () => {
    const created = await request(app)
      .post('/api/items')
      .send({ name: 'findme' })
      .set('Content-Type', 'application/json')
    const res = await request(app).get(`/api/items/${created.body.id}`)
    expect(res.status).toBe(200)
    expect(res.body.name).toBe('findme')
  })

  // Test 7: PUT /api/items/:id → 200 updated
  it('PUT /api/items/:id updates item and returns 200', async () => {
    const created = await request(app)
      .post('/api/items')
      .send({ name: 'original' })
      .set('Content-Type', 'application/json')
    const res = await request(app)
      .put(`/api/items/${created.body.id}`)
      .send({ name: 'updated' })
      .set('Content-Type', 'application/json')
    expect(res.status).toBe(200)
    expect(res.body.name).toBe('updated')
  })

  // Test 8: DELETE /api/items/:id → 204
  it('DELETE /api/items/:id deletes item and returns 204', async () => {
    const created = await request(app)
      .post('/api/items')
      .send({ name: 'deleteme' })
      .set('Content-Type', 'application/json')
    const res = await request(app).delete(`/api/items/${created.body.id}`)
    expect(res.status).toBe(204)
  })

  // Test 9: GET /api/items/999 → 404
  it('GET /api/items/999 returns 404', async () => {
    const res = await request(app).get('/api/items/999')
    expect(res.status).toBe(404)
    expect(res.body.error).toBe('Not found')
  })

  // Test 10: GET /nonexistent → 404
  it('GET /nonexistent returns 404', async () => {
    const res = await request(app).get('/nonexistent')
    expect(res.status).toBe(404)
  })
})
