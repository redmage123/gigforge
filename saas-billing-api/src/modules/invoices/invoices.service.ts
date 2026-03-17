
import { getPool } from '../../config/database'
import { NotFoundError, ForbiddenError } from '../../types/errors'
import { getOrgPlan } from '../plans/plans.service'
import { Plan } from '../plans/plans.constants'

export interface Invoice {
  id: string
  org_id: string
  plan_id: string
  base_amount: number
  overage_amount: number
  total: number
  status: 'draft' | 'paid' | 'void'
  period_start: Date
  period_end: Date
  created_at: Date
}

export function calculateInvoiceTotal(
  plan: Plan,
  usageCount: number
): { baseAmount: number; overageAmount: number; total: number } {
  const base = plan.priceUsd * 100 // cents
  let overage = 0
  if (plan.monthlyRequests !== null && usageCount > plan.monthlyRequests) {
    const overCount = usageCount - plan.monthlyRequests
    overage = Math.ceil(overCount * plan.overageRateCents)
  }
  return { baseAmount: base, overageAmount: overage, total: base + overage }
}

export async function listInvoices(orgId: string, requestingUserId: string): Promise<Invoice[]> {
  const pool = getPool()

  // Check membership
  const memberCheck = await pool.query(
    'SELECT user_id FROM org_members WHERE org_id = $1 AND user_id = $2',
    [orgId, requestingUserId]
  )
  if (memberCheck.rows.length === 0) {
    throw new ForbiddenError('Access denied')
  }

  const result = await pool.query(
    'SELECT id, org_id, plan_id, base_amount, overage_amount, total, status, period_start, period_end, created_at FROM invoices WHERE org_id = $1 ORDER BY created_at DESC',
    [orgId]
  )
  return result.rows as Invoice[]
}

export async function getInvoice(
  orgId: string,
  invoiceId: string,
  requestingUserId: string
): Promise<Invoice> {
  const pool = getPool()

  // Check membership
  const memberCheck = await pool.query(
    'SELECT user_id FROM org_members WHERE org_id = $1 AND user_id = $2',
    [orgId, requestingUserId]
  )
  if (memberCheck.rows.length === 0) {
    throw new ForbiddenError('Access denied')
  }

  const result = await pool.query(
    'SELECT id, org_id, plan_id, base_amount, overage_amount, total, status, period_start, period_end, created_at FROM invoices WHERE id = $1 AND org_id = $2',
    [invoiceId, orgId]
  )

  if (result.rows.length === 0) {
    throw new NotFoundError('Invoice not found')
  }

  return result.rows[0] as Invoice
}

export async function generateInvoice(
  orgId: string,
  requestingUserId: string
): Promise<Invoice> {
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
  const plan = subscription.plan

  // Get usage for the billing period
  const usageResult = await pool.query(
    `SELECT COALESCE(SUM(count), 0) as total
     FROM usage_events
     WHERE org_id = $1
       AND created_at >= $2
       AND created_at < $3`,
    [orgId, subscription.current_period_start, subscription.current_period_end]
  )

  const usageCount = parseInt(usageResult.rows[0].total as string, 10)
  const { baseAmount, overageAmount, total } = calculateInvoiceTotal(plan, usageCount)

  const id = crypto.randomUUID()
  const result = await pool.query(
    `INSERT INTO invoices (id, org_id, plan_id, base_amount, overage_amount, total, status, period_start, period_end)
     VALUES ($1, $2, $3, $4, $5, $6, 'draft', $7, $8)
     RETURNING id, org_id, plan_id, base_amount, overage_amount, total, status, period_start, period_end, created_at`,
    [
      id,
      orgId,
      subscription.plan_id,
      baseAmount,
      overageAmount,
      total,
      subscription.current_period_start,
      subscription.current_period_end,
    ]
  )

  return result.rows[0] as Invoice
}

export async function markInvoicePaid(invoiceId: string): Promise<void> {
  const pool = getPool()
  await pool.query('UPDATE invoices SET status = $1 WHERE id = $2', ['paid', invoiceId])
}
