import request from 'supertest'
import app from '../src/app'

jest.mock('../src/config/database')
import { getPool } from '../src/config/database'

const mockQuery = jest.fn()

beforeEach(() => {
  jest.mocked(getPool).mockReturnValue({ query: mockQuery } as any)
  mockQuery.mockReset()
})

jest.mock('jsonwebtoken', () => ({
  sign: jest.fn().mockReturnValue('mock_token'),
  verify: jest.fn(),
}))
import jwt from 'jsonwebtoken'

const AUTH_HEADER = 'Bearer mock_token'
const USER_ID = 'user-owner-1'
const ORG_ID = 'org-1'

function mockAuthUser(userId = USER_ID, orgIds: string[] = [ORG_ID]) {
  jest.mocked(jwt.verify).mockReturnValue({ userId, email: 'owner@example.com', orgIds } as any)
}

describe('POST /orgs', () => {
  test('1. create org returns 201, creator is owner', async () => {
    mockAuthUser()
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({
        rows: [{ id: ORG_ID, name: 'My Org', owner_id: USER_ID, created_at: new Date() }],
      }) // INSERT org
      .mockResolvedValueOnce({ rows: [] }) // INSERT member
      .mockResolvedValueOnce({ rows: [] }) // COMMIT

    const res = await request(app)
      .post('/orgs')
      .set('Authorization', AUTH_HEADER)
      .send({ name: 'My Org' })

    expect(res.status).toBe(201)
    expect(res.body.org).toBeDefined()
    expect(res.body.org.owner_id).toBe(USER_ID)
  })

  test('2. missing name returns 422', async () => {
    mockAuthUser()

    const res = await request(app)
      .post('/orgs')
      .set('Authorization', AUTH_HEADER)
      .send({})

    expect(res.status).toBe(422)
  })
})

describe('GET /orgs/:orgId', () => {
  test('3. owner can view org returns 200', async () => {
    mockAuthUser()
    mockQuery
      .mockResolvedValueOnce({ rows: [{ role: 'owner' }] }) // membership check
      .mockResolvedValueOnce({
        rows: [{ id: ORG_ID, name: 'My Org', owner_id: USER_ID, created_at: new Date() }],
      }) // org query

    const res = await request(app)
      .get(`/orgs/${ORG_ID}`)
      .set('Authorization', AUTH_HEADER)

    expect(res.status).toBe(200)
    expect(res.body.org.id).toBe(ORG_ID)
  })

  test('4. non-member returns 403', async () => {
    mockAuthUser('different-user', [])
    mockQuery.mockResolvedValueOnce({ rows: [] }) // no membership

    const res = await request(app)
      .get(`/orgs/${ORG_ID}`)
      .set('Authorization', AUTH_HEADER)

    expect(res.status).toBe(403)
  })
})

describe('POST /orgs/:orgId/members', () => {
  test('5. invite member returns 201', async () => {
    mockAuthUser()
    mockQuery
      .mockResolvedValueOnce({ rows: [{ role: 'owner' }] }) // requestor membership
      .mockResolvedValueOnce({ rows: [{ id: 'invitee-1' }] }) // find user by email
      .mockResolvedValueOnce({ rows: [] }) // check not already member
      .mockResolvedValueOnce({
        rows: [{ org_id: ORG_ID, user_id: 'invitee-1', role: 'member', joined_at: new Date() }],
      }) // insert member

    const res = await request(app)
      .post(`/orgs/${ORG_ID}/members`)
      .set('Authorization', AUTH_HEADER)
      .send({ email: 'invitee@example.com' })

    expect(res.status).toBe(201)
    expect(res.body.member).toBeDefined()
  })

  test('6. invite nonexistent user returns 404', async () => {
    mockAuthUser()
    mockQuery
      .mockResolvedValueOnce({ rows: [{ role: 'owner' }] }) // requestor membership
      .mockResolvedValueOnce({ rows: [] }) // user not found

    const res = await request(app)
      .post(`/orgs/${ORG_ID}/members`)
      .set('Authorization', AUTH_HEADER)
      .send({ email: 'ghost@example.com' })

    expect(res.status).toBe(404)
  })
})

describe('DELETE /orgs/:orgId/members/:userId', () => {
  test('7. remove member returns 200', async () => {
    mockAuthUser()
    const MEMBER_ID = 'member-user-1'
    mockQuery
      .mockResolvedValueOnce({ rows: [{ role: 'owner' }] }) // requestor is member
      .mockResolvedValueOnce({ rows: [{ owner_id: USER_ID }] }) // org owner check
      .mockResolvedValueOnce({ rows: [] }) // DELETE

    const res = await request(app)
      .delete(`/orgs/${ORG_ID}/members/${MEMBER_ID}`)
      .set('Authorization', AUTH_HEADER)

    expect(res.status).toBe(200)
  })

  test('8. cannot remove owner returns 400', async () => {
    mockAuthUser()
    mockQuery
      .mockResolvedValueOnce({ rows: [{ role: 'owner' }] }) // requestor is member
      .mockResolvedValueOnce({ rows: [{ owner_id: USER_ID }] }) // org owner check — same as target

    const res = await request(app)
      .delete(`/orgs/${ORG_ID}/members/${USER_ID}`)
      .set('Authorization', AUTH_HEADER)

    expect(res.status).toBe(400)
  })
})
