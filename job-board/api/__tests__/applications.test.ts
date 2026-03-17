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

const sampleJob = {
  id: 10,
  employer_id: 5,
  title: 'Dev',
  description: 'Cool job',
  status: 'open'
}

const sampleApplication = {
  id: 1,
  applicant_id: 1,
  job_id: 10,
  cover_letter: 'I am great',
  status: 'pending',
  created_at: new Date()
}

describe('POST /jobs/:jobId/apply', () => {
  it('applicant can apply to a job and get 201', async () => {
    mockAuth({ id: 1, email: 'applicant@test.com', role: 'applicant' })
    mockQuery
      .mockResolvedValueOnce({ rows: [sampleJob] }) // job check
      .mockResolvedValueOnce({ rows: [] }) // duplicate check
      .mockResolvedValueOnce({ rows: [sampleApplication] }) // insert

    const res = await request(app)
      .post('/jobs/10/apply')
      .set('Authorization', 'Bearer token')
      .send({ cover_letter: 'I am great' })

    expect(res.status).toBe(201)
    expect(res.body.job_id).toBe(10)
  })

  it('employer cannot apply to a job and gets 403', async () => {
    mockAuth({ id: 5, email: 'employer@test.com', role: 'employer' })

    const res = await request(app)
      .post('/jobs/10/apply')
      .set('Authorization', 'Bearer token')
      .send({ cover_letter: 'I want to apply' })

    expect(res.status).toBe(403)
  })

  it('duplicate application returns 409', async () => {
    mockAuth({ id: 1, email: 'applicant@test.com', role: 'applicant' })
    mockQuery
      .mockResolvedValueOnce({ rows: [sampleJob] }) // job check
      .mockResolvedValueOnce({ rows: [sampleApplication] }) // duplicate found

    const res = await request(app)
      .post('/jobs/10/apply')
      .set('Authorization', 'Bearer token')
      .send({ cover_letter: 'Applying again' })

    expect(res.status).toBe(409)
  })
})

describe('GET /applications/mine', () => {
  it('applicant gets their own applications list', async () => {
    mockAuth({ id: 1, email: 'applicant@test.com', role: 'applicant' })
    mockQuery.mockResolvedValueOnce({
      rows: [{ ...sampleApplication, job_title: 'Dev', location: 'London', job_type: 'full-time' }]
    })

    const res = await request(app)
      .get('/applications/mine')
      .set('Authorization', 'Bearer token')

    expect(res.status).toBe(200)
    expect(res.body.applications).toHaveLength(1)
  })

  it('employer cannot access /applications/mine and gets 403', async () => {
    mockAuth({ id: 5, email: 'employer@test.com', role: 'employer' })

    const res = await request(app)
      .get('/applications/mine')
      .set('Authorization', 'Bearer token')

    expect(res.status).toBe(403)
  })
})

describe('GET /jobs/:jobId/applications', () => {
  it("employer can view their own job's applications", async () => {
    mockAuth({ id: 5, email: 'employer@test.com', role: 'employer' })
    mockQuery
      .mockResolvedValueOnce({ rows: [sampleJob] }) // job ownership check
      .mockResolvedValueOnce({
        rows: [{ ...sampleApplication, applicant_name: 'Alice', applicant_email: 'alice@test.com' }]
      })

    const res = await request(app)
      .get('/jobs/10/applications')
      .set('Authorization', 'Bearer token')

    expect(res.status).toBe(200)
    expect(res.body.applications).toHaveLength(1)
  })

  it("employer gets 403 when viewing another employer's job applications", async () => {
    mockAuth({ id: 99, email: 'other@test.com', role: 'employer' })
    // Job belongs to employer_id: 5
    mockQuery.mockResolvedValueOnce({ rows: [sampleJob] })

    const res = await request(app)
      .get('/jobs/10/applications')
      .set('Authorization', 'Bearer token')

    expect(res.status).toBe(403)
  })
})

describe('PATCH /jobs/:jobId/applications/:appId', () => {
  it('employer can update application status and get 200', async () => {
    mockAuth({ id: 5, email: 'employer@test.com', role: 'employer' })
    mockQuery
      .mockResolvedValueOnce({ rows: [sampleJob] }) // job ownership
      .mockResolvedValueOnce({ rows: [{ ...sampleApplication, status: 'accepted' }] })

    const res = await request(app)
      .patch('/jobs/10/applications/1')
      .set('Authorization', 'Bearer token')
      .send({ status: 'accepted' })

    expect(res.status).toBe(200)
    expect(res.body.status).toBe('accepted')
  })
})
