import { getPool } from '../../config/database'
import { PLANS, PlanId, Plan } from './plans.constants'
import { BadRequestError, ValidationError } from '../../types/errors'

export interface OrgSubscription {
  org_id: string
  plan_id: PlanId
  status: string
  current_period_start: Date
  current_period_end: Date
}

export function listPlans(): Plan[] {
  return Object.values(PLANS)
}

export async function getOrgPlan(orgId: string): Promise<OrgSubscription & { plan: Plan }> {
  const pool = getPool()

  const result = await pool.query(
    'SELECT org_id, plan_id, status, current_period_start, current_period_end FROM subscriptions WHERE org_id = $1',
    [orgId]
  )

  let subscription: OrgSubscription
  if (result.rows.length === 0) {
    // Default to free plan
    subscription = {
      org_id: orgId,
      plan_id: 'free',
      status: 'active',
      current_period_start: new Date(),
      current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    }
  } else {
    subscription = result.rows[0] as OrgSubscription
  }

  const plan = PLANS[subscription.plan_id]
  return { ...subscription, plan }
}

export async function setOrgPlan(orgId: string, planId: string): Promise<OrgSubscription & { plan: Plan }> {
  const pool = getPool()

  if (!(planId in PLANS)) {
    throw new ValidationError(`Invalid plan ID: ${planId}`)
  }

  const newPlan = PLANS[planId as PlanId]

  // Check downgrade constraints: if new plan has a lower request limit, check current usage
  if (newPlan.monthlyRequests !== null) {
    const usageResult = await pool.query(
      `SELECT COALESCE(SUM(count), 0) as total
       FROM usage_events
       WHERE org_id = $1
         AND created_at >= date_trunc('month', CURRENT_TIMESTAMP)`,
      [orgId]
    )
    const currentUsage = usageResult.rows.length > 0
      ? parseInt(usageResult.rows[0].total as string, 10)
      : 0

    if (currentUsage > newPlan.monthlyRequests) {
      throw new BadRequestError(
        `Cannot downgrade: current usage (${currentUsage}) exceeds new plan limit (${newPlan.monthlyRequests})`
      )
    }
  }

  const now = new Date()
  const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

  const result = await pool.query(
    `INSERT INTO subscriptions (org_id, plan_id, status, current_period_start, current_period_end)
     VALUES ($1, $2, 'active', $3, $4)
     ON CONFLICT (org_id) DO UPDATE
       SET plan_id = $2, status = 'active', current_period_start = $3, current_period_end = $4
     RETURNING org_id, plan_id, status, current_period_start, current_period_end`,
    [orgId, planId, now, periodEnd]
  )

  const subscription = result.rows[0] as OrgSubscription
  const plan = PLANS[subscription.plan_id]
  return { ...subscription, plan }
}
