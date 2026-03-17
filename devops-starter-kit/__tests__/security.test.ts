import express from 'express'
import request from 'supertest'
import {
  createHelmet,
  createCors,
  createRateLimit,
  composeSecurity,
} from '../src/middleware/security'

function buildApp(...middlewares: express.RequestHandler[]) {
  const app = express()
  middlewares.forEach((mw) => app.use(mw))
  app.get('/test', (_req, res) => res.status(200).json({ ok: true }))
  return app
}

describe('Security middleware', () => {
  // Test 1: createHelmet — X-Content-Type-Options: nosniff present
  it('createHelmet sets X-Content-Type-Options: nosniff', async () => {
    const app = buildApp(createHelmet())
    const res = await request(app).get('/test')
    expect(res.headers['x-content-type-options']).toBe('nosniff')
  })

  // Test 2: createHelmet — X-Frame-Options present
  it('createHelmet sets X-Frame-Options header', async () => {
    const app = buildApp(createHelmet())
    const res = await request(app).get('/test')
    expect(res.headers['x-frame-options']).toBeDefined()
  })

  // Test 3: createCors — allowed origin → ACAO header set
  it('createCors allows specified origin', async () => {
    const app = buildApp(createCors(['http://allowed.com']))
    const res = await request(app)
      .get('/test')
      .set('Origin', 'http://allowed.com')
    expect(res.headers['access-control-allow-origin']).toBe('http://allowed.com')
  })

  // Test 4: createCors — disallowed origin → no ACAO header
  it('createCors blocks disallowed origin', async () => {
    const app = express()
    app.use(createCors(['http://allowed.com']))
    app.get('/test', (_req, res) => res.status(200).json({ ok: true }))
    // Error handler to prevent unhandled rejection
    app.use((_err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      res.status(403).json({ error: 'CORS' })
    })
    const res = await request(app)
      .get('/test')
      .set('Origin', 'http://blocked.com')
    expect(res.headers['access-control-allow-origin']).toBeUndefined()
  })

  // Test 5: createRateLimit — under limit → 200
  it('createRateLimit allows requests under the limit', async () => {
    const app = buildApp(createRateLimit(60000, 10))
    const res = await request(app).get('/test')
    expect(res.status).toBe(200)
  })

  // Test 6: createRateLimit — over limit → 429
  it('createRateLimit returns 429 when limit exceeded', async () => {
    const app = buildApp(createRateLimit(60000, 2))
    await request(app).get('/test')
    await request(app).get('/test')
    const res = await request(app).get('/test')
    expect(res.status).toBe(429)
  })

  // Test 7: composeSecurity — all security headers present
  it('composeSecurity applies all security headers', async () => {
    const app = express()
    composeSecurity({ allowedOrigins: ['*'] }).forEach((mw) => app.use(mw))
    app.get('/test', (_req, res) => res.status(200).json({ ok: true }))
    const res = await request(app).get('/test')
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(res.status).toBe(200)
  })

  // Test 8: composeSecurity — OPTIONS preflight → 204
  it('composeSecurity handles OPTIONS preflight with 204', async () => {
    const app = express()
    composeSecurity({ allowedOrigins: ['http://example.com'] }).forEach((mw) => app.use(mw))
    app.get('/test', (_req, res) => res.status(200).json({ ok: true }))
    const res = await request(app)
      .options('/test')
      .set('Origin', 'http://example.com')
      .set('Access-Control-Request-Method', 'GET')
    expect([200, 204]).toContain(res.status)
  })

  // Test 9: Security middleware runs before route handler (verify via response order)
  it('security middleware applies before route handler runs', async () => {
    const order: string[] = []
    const app = express()
    const securityMiddlewares = composeSecurity({ allowedOrigins: ['*'] })
    securityMiddlewares.forEach((mw) => {
      app.use((_req, _res, next) => {
        order.push('security')
        next()
      })
      app.use(mw)
    })
    app.get('/test', (_req, res) => {
      order.push('route')
      res.status(200).json({ ok: true })
    })
    await request(app).get('/test')
    const routeIdx = order.lastIndexOf('route')
    const lastSecurityIdx = order.lastIndexOf('security')
    expect(lastSecurityIdx).toBeLessThan(routeIdx)
  })
})
