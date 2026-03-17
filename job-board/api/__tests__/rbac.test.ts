jest.mock('../src/config/database')
jest.mock('jsonwebtoken')

import { getPool } from '../src/config/database'
import jwt from 'jsonwebtoken'
import request from 'supertest'
import { createApp } from '../src/app'
import type { Role } from '../src/types/role'

const mockQuery = jest.fn()
const app = createApp()

function mockAuth(user: { id: number; email: string; role: Role } = { id: 1, email: 'test@test.com', role: 'applicant' }) {
  jest.mocked(jwt.verify).mockReturnValue(user as any)
}

beforeEach(() => {
  jest.mocked(getPool).mockReturnValue({ query: mockQuery } as any)
  mockQuery.mockReset()
  jest.mocked(jwt.verify).mockReset()
})

describe('requireRole middleware', () => {
  it('passes through when the user has a correct role', async () => {
    mockAuth({ id: 1, email: 'employer@test.com', role: 'employer' })
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 1, title: 'Job', description: 'Desc', employer_id: 1 }] })

    const res = await request(app)
      .post('/jobs')
      .set('Authorization', 'Bearer token')
      .send({ title: 'My Job', description: 'Description here' })

    // Should not get 403
    expect(res.status).not.toBe(403)
  })

  it('returns 403 when the user has the wrong role', async () => {
    mockAuth({ id: 2, email: 'applicant@test.com', role: 'applicant' })

    const res = await request(app)
      .post('/jobs')
      .set('Authorization', 'Bearer token')
      .send({ title: 'My Job', description: 'Description here' })

    expect(res.status).toBe(403)
  })

  it('returns 401 when the request is unauthenticated', async () => {
    const res = await request(app)
      .post('/jobs')
      .send({ title: 'My Job', description: 'Description here' })

    expect(res.status).toBe(401)
  })
})

describe('Admin routes', () => {
  it('GET /admin/users returns 200 for admin', async () => {
    mockAuth({ id: 1, email: 'admin@test.com', role: 'admin' })
    mockQuery.mockResolvedValueOnce({
      rows: [
        { id: 1, email: 'admin@test.com', name: 'Admin', role: 'admin', created_at: new Date() },
        { id: 2, email: 'user@test.com', name: 'User', role: 'applicant', created_at: new Date() }
      ]
    })

    const res = await request(app)
      .get('/admin/users')
      .set('Authorization', 'Bearer token')

    expect(res.status).toBe(200)
    expect(res.body.users).toHaveLength(2)
  })

  it('GET /admin/users returns 403 for non-admin', async () => {
    mockAuth({ id: 2, email: 'employer@test.com', role: 'employer' })

    const res = await request(app)
      .get('/admin/users')
      .set('Authorization', 'Bearer token')

    expect(res.status).toBe(403)
  })

  it('PUT /admin/users/:id/role returns 200 for admin', async () => {
    mockAuth({ id: 1, email: 'admin@test.com', role: 'admin' })
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 2, email: 'user@test.com', name: 'User', role: 'employer' }]
    })

    const res = await request(app)
      .put('/admin/users/2/role')
      .set('Authorization', 'Bearer token')
      .send({ role: 'employer' })

    expect(res.status).toBe(200)
    expect(res.body.role).toBe('employer')
  })

  it('DELETE /admin/jobs/:id returns 204 for admin', async () => {
    mockAuth({ id: 1, email: 'admin@test.com', role: 'admin' })
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 5 }] }) // job exists check
      .mockResolvedValueOnce({ rows: [] }) // delete

    const res = await request(app)
      .delete('/admin/jobs/5')
      .set('Authorization', 'Bearer token')

    expect(res.status).toBe(204)
  })
})
