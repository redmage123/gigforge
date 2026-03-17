
import { getPool } from '../../config/database'
import { NotFoundError, ForbiddenError, ConflictError, BadRequestError } from '../../types/errors'

export interface OrgRecord {
  id: string
  name: string
  owner_id: string
  created_at: Date
}

export interface OrgMember {
  user_id: string
  org_id: string
  role: string
  joined_at: Date
}

export async function createOrg(name: string, ownerId: string): Promise<OrgRecord> {
  const pool = getPool()
  const id = crypto.randomUUID()

  await pool.query('BEGIN')
  try {
    const result = await pool.query(
      'INSERT INTO organizations (id, name, owner_id) VALUES ($1, $2, $3) RETURNING id, name, owner_id, created_at',
      [id, name, ownerId]
    )
    await pool.query(
      'INSERT INTO org_members (org_id, user_id, role) VALUES ($1, $2, $3)',
      [id, ownerId, 'owner']
    )
    await pool.query('COMMIT')
    return result.rows[0] as OrgRecord
  } catch (err) {
    await pool.query('ROLLBACK')
    throw err
  }
}

export async function getOrg(orgId: string, requestingUserId: string): Promise<OrgRecord> {
  const pool = getPool()

  // Check membership
  const memberCheck = await pool.query(
    'SELECT role FROM org_members WHERE org_id = $1 AND user_id = $2',
    [orgId, requestingUserId]
  )
  if (memberCheck.rows.length === 0) {
    throw new ForbiddenError('You are not a member of this organization')
  }

  const result = await pool.query(
    'SELECT id, name, owner_id, created_at FROM organizations WHERE id = $1',
    [orgId]
  )
  if (result.rows.length === 0) {
    throw new NotFoundError('Organization not found')
  }

  return result.rows[0] as OrgRecord
}

export async function inviteMember(
  orgId: string,
  inviteeEmail: string,
  requestingUserId: string
): Promise<OrgMember> {
  const pool = getPool()

  // Check requestor is a member
  const memberCheck = await pool.query(
    'SELECT role FROM org_members WHERE org_id = $1 AND user_id = $2',
    [orgId, requestingUserId]
  )
  if (memberCheck.rows.length === 0) {
    throw new ForbiddenError('You are not a member of this organization')
  }

  // Find invitee
  const userResult = await pool.query('SELECT id FROM users WHERE email = $1', [inviteeEmail])
  if (userResult.rows.length === 0) {
    throw new NotFoundError('User not found')
  }
  const inviteeId = userResult.rows[0].id as string

  // Check not already a member
  const existingMember = await pool.query(
    'SELECT user_id FROM org_members WHERE org_id = $1 AND user_id = $2',
    [orgId, inviteeId]
  )
  if (existingMember.rows.length > 0) {
    throw new ConflictError('User is already a member')
  }

  const result = await pool.query(
    'INSERT INTO org_members (org_id, user_id, role) VALUES ($1, $2, $3) RETURNING org_id, user_id, role, joined_at',
    [orgId, inviteeId, 'member']
  )
  return result.rows[0] as OrgMember
}

export async function removeMember(
  orgId: string,
  targetUserId: string,
  requestingUserId: string
): Promise<void> {
  const pool = getPool()

  // Check requestor is a member (or owner)
  const memberCheck = await pool.query(
    'SELECT role FROM org_members WHERE org_id = $1 AND user_id = $2',
    [orgId, requestingUserId]
  )
  if (memberCheck.rows.length === 0) {
    throw new ForbiddenError('You are not a member of this organization')
  }

  // Cannot remove owner
  const orgResult = await pool.query('SELECT owner_id FROM organizations WHERE id = $1', [orgId])
  if (orgResult.rows.length > 0 && orgResult.rows[0].owner_id === targetUserId) {
    throw new BadRequestError('Cannot remove the organization owner')
  }

  await pool.query('DELETE FROM org_members WHERE org_id = $1 AND user_id = $2', [orgId, targetUserId])
}
