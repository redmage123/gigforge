/**
 * Widget endpoint tests — tests the /widget.js static file route.
 */
import request from 'supertest'

jest.mock('../src/config/database', () => require('../src/config/__mocks__/database'))
jest.mock('../src/config/openai', () => ({
  getOpenAIClient: jest.fn(),
  resetOpenAIClient: jest.fn(),
}))

import { createApp } from '../src/app'

const app = createApp()

describe('GET /widget.js', () => {
  it('returns HTTP 200', async () => {
    const res = await request(app).get('/widget.js')
    expect(res.status).toBe(200)
  })

  it('Content-Type is text/javascript', async () => {
    const res = await request(app).get('/widget.js')
    expect(res.headers['content-type']).toMatch(/javascript/)
  })

  it('Cache-Control header includes max-age', async () => {
    const res = await request(app).get('/widget.js')
    expect(res.headers['cache-control']).toMatch(/max-age/)
  })

  it('bundle size is under 8192 bytes', async () => {
    const res = await request(app).get('/widget.js')
    const size = Buffer.byteLength(res.text, 'utf8')
    expect(size).toBeLessThan(8192)
  })
})
