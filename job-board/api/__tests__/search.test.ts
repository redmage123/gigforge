jest.mock('../src/config/database')
jest.mock('jsonwebtoken')

import { getPool } from '../src/config/database'
import jwt from 'jsonwebtoken'
import request from 'supertest'
import { createApp } from '../src/app'

const mockQuery = jest.fn()
const app = createApp()

beforeEach(() => {
  jest.mocked(getPool).mockReturnValue({ query: mockQuery } as any)
  mockQuery.mockReset()
  jest.mocked(jwt.verify).mockReset()
})

const engineerJob = {
  id: 1,
  employer_id: 1,
  title: 'Software Engineer',
  description: 'Build amazing things',
  location: 'London',
  status: 'open'
}

const designerJob = {
  id: 2,
  employer_id: 1,
  title: 'UI Designer',
  description: 'Design beautiful interfaces',
  location: 'Manchester',
  status: 'open'
}

describe('Job search', () => {
  it('GET /jobs?q=engineer returns matching jobs', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [engineerJob] })

    const res = await request(app).get('/jobs?q=engineer')

    expect(res.status).toBe(200)
    expect(res.body.jobs).toHaveLength(1)
    expect(res.body.jobs[0].title).toBe('Software Engineer')
  })

  it('GET /jobs with no query returns all open jobs', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [engineerJob, designerJob] })

    const res = await request(app).get('/jobs')

    expect(res.status).toBe(200)
    expect(res.body.jobs).toHaveLength(2)
  })

  it('GET /jobs?q=nonexistent returns empty array', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] })

    const res = await request(app).get('/jobs?q=nonexistent')

    expect(res.status).toBe(200)
    expect(res.body.jobs).toHaveLength(0)
  })

  it('GET /jobs?location=London filters by location', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [engineerJob] })

    const res = await request(app).get('/jobs?location=London')

    expect(res.status).toBe(200)
    // Verify the query was called with the location filter
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('ILIKE'),
      expect.arrayContaining(['%London%'])
    )
  })

  it('search query is parameterized, not string-interpolated (SQL injection safe)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] })

    await request(app).get('/jobs?q=engineer OR 1=1')

    // The SQL should use parameterized queries, not string interpolation
    const [sql, params] = mockQuery.mock.calls[0]

    // The query string 'engineer OR 1=1' should appear as a parameter value
    expect(params).toContain('engineer OR 1=1')

    // The SQL template should use positional parameter ($N), not the literal query string
    expect(sql).not.toContain('engineer OR 1=1')

    // Should use websearch_to_tsquery with a positional param
    expect(sql).toMatch(/websearch_to_tsquery\('english',\s*\$\d+\)/)
  })
})
