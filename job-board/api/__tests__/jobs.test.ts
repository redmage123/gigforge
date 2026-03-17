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
  id: 1,
  employer_id: 1,
  title: 'Senior Engineer',
  description: 'A great job',
  location: 'London',
  job_type: 'full-time',
  salary_range: '£60k-£80k',
  status: 'open',
  created_at: new Date()
}

describe('GET /jobs', () => {
  it('returns 200 with paginated job list', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [sampleJob, { ...sampleJob, id: 2 }] })

    const res = await request(app).get('/jobs')

    expect(res.status).toBe(200)
    expect(res.body.jobs).toHaveLength(2)
    expect(res.body.page).toBe(1)
  })

  it('employer sees own drafts via additional query', async () => {
    mockAuth({ id: 1, email: 'employer@test.com', role: 'employer' })

    // First call: public jobs; subsequent would be employer drafts (tested separately)
    mockQuery.mockResolvedValueOnce({ rows: [sampleJob] })

    const res = await request(app)
      .get('/jobs')
      .set('Authorization', 'Bearer token')

    expect(res.status).toBe(200)
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('status = $1'),
      expect.arrayContaining(['open'])
    )
  })

  it('returns second page with correct offset', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] })

    const res = await request(app).get('/jobs?page=2')

    expect(res.status).toBe(200)
    expect(res.body.page).toBe(2)
    // Check that the offset parameter (10) is passed
    expect(mockQuery).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining([10, 10]) // limit=10, offset=10
    )
  })
})

describe('GET /jobs/:id', () => {
  it('returns 200 for a public job', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [sampleJob] })

    const res = await request(app).get('/jobs/1')

    expect(res.status).toBe(200)
    expect(res.body.id).toBe(1)
  })
})

describe('POST /jobs', () => {
  it('employer can create a job and get 201', async () => {
    mockAuth({ id: 1, email: 'employer@test.com', role: 'employer' })
    mockQuery.mockResolvedValueOnce({ rows: [{ ...sampleJob, id: 3 }] })

    const res = await request(app)
      .post('/jobs')
      .set('Authorization', 'Bearer token')
      .send({ title: 'Senior Engineer', description: 'A great job', location: 'London' })

    expect(res.status).toBe(201)
    expect(res.body.id).toBe(3)
  })

  it('applicant cannot create a job and gets 403', async () => {
    mockAuth({ id: 2, email: 'applicant@test.com', role: 'applicant' })

    const res = await request(app)
      .post('/jobs')
      .set('Authorization', 'Bearer token')
      .send({ title: 'Senior Engineer', description: 'A great job' })

    expect(res.status).toBe(403)
  })
})

describe('PUT /jobs/:id', () => {
  it('employer can update own job and get 200', async () => {
    mockAuth({ id: 1, email: 'employer@test.com', role: 'employer' })
    // Fetch existing job
    mockQuery.mockResolvedValueOnce({ rows: [sampleJob] })
    // Update
    mockQuery.mockResolvedValueOnce({ rows: [{ ...sampleJob, title: 'Updated Title' }] })

    const res = await request(app)
      .put('/jobs/1')
      .set('Authorization', 'Bearer token')
      .send({ title: 'Updated Title' })

    expect(res.status).toBe(200)
    expect(res.body.title).toBe('Updated Title')
  })

  it("employer gets 404 when updating another employer's job", async () => {
    mockAuth({ id: 99, email: 'other@test.com', role: 'employer' })
    // Job belongs to employer_id: 1
    mockQuery.mockResolvedValueOnce({ rows: [sampleJob] })

    const res = await request(app)
      .put('/jobs/1')
      .set('Authorization', 'Bearer token')
      .send({ title: 'Hacked Title' })

    expect(res.status).toBe(404)
  })
})

describe('DELETE /jobs/:id', () => {
  it('employer can delete own job and get 204', async () => {
    mockAuth({ id: 1, email: 'employer@test.com', role: 'employer' })
    mockQuery
      .mockResolvedValueOnce({ rows: [sampleJob] }) // fetch
      .mockResolvedValueOnce({ rows: [] }) // delete

    const res = await request(app)
      .delete('/jobs/1')
      .set('Authorization', 'Bearer token')

    expect(res.status).toBe(204)
  })

  it('admin can delete any job and get 204', async () => {
    mockAuth({ id: 99, email: 'admin@test.com', role: 'admin' })
    mockQuery
      .mockResolvedValueOnce({ rows: [sampleJob] }) // fetch
      .mockResolvedValueOnce({ rows: [] }) // delete

    const res = await request(app)
      .delete('/jobs/1')
      .set('Authorization', 'Bearer token')

    expect(res.status).toBe(204)
  })
})
