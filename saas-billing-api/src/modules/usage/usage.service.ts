
import { getPool } from '../../config/database'
import { ForbiddenError } from '../../types/errors'
import { getOrgPlan } from '../plans/plans.service'
import { PLANS } from '../plans/plans.constants'

export interface UsageEvent {
  id: string
  org_id: string
  event_type: string
  count: number
  created_at: Date
}

export interface UsageSummary {
  org_id: string
  plan_id: string
  used: number
  limit: number | null
  overage: number
  billing_period_start: Date
  billing_period_end: Date
}

export async function recordUsage(
  orgId: string,
  requestingUserId: string,
  eventType: string,
  count: number
): Promise<UsageEvent> {
  const pool = getPool()

  // Check membership
  const memberCheck = await pool.query(
    'SELECT user_id FROM org_members WHERE org_id = $1 AND user_id = $2',
    [orgId, requestingUserId]
  )
  if (memberCheck.rows.length === 0) {
    throw new ForbiddenError('Access denied')
  }

  const id = crypto.randomUUID()
  const result = await pool.query(
    'INSERT INTO usage_events (id, org_id, event_type, count) VALUES ($1, $2, $3, $4) RETURNING id, org_id, event_type, count, created_at',
    [id, orgId, eventType, count]
  )
  return result.rows[0] as UsageEvent
}

export async function getUsageSummary(
  orgId: string,
  requestingUserId: string
): Promise<UsageSummary> {
  const pool = getPool()

  // Check membership
  const memberCheck = await pool.query(
    'SELECT user_id FROM org_members WHERE org_id = $1 AND user_id = $2',
    [orgId, requestingUserId]
  )
  if (memberCheck.rows.length === 0) {
    throw new ForbiddenError('Access denied')
  }

  const subscription = await getOrgPlan(orgId)
  const plan = PLANS[subscription.plan_id]

  const usageResult = await pool.query(
    `SELECT COALESCE(SUM(count), 0) as total
     FROM usage_events
     WHERE org_id = $1
       AND created_at >= $2
       AND created_at < $3`,
    [orgId, subscription.current_period_start, subscription.current_period_end]
  )

  const used = parseInt(usageResult.rows[0].total as string, 10)
  const limit = plan.monthlyRequests

  let overage = 0
  if (limit !== null && used > limit) {
    overage = used - limit
  }

  return {
    org_id: orgId,
    plan_id: subscription.plan_id,
    used,
    limit,
    overage,
    billing_period_start: subscription.current_period_start,
    billing_period_end: subscription.current_period_end,
  }
}
