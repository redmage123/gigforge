import { getStripeClient } from '../../config/stripe'
import { getPool } from '../../config/database'
import { BadRequestError } from '../../types/errors'

export async function verifyAndDispatch(
  rawBody: Buffer,
  signature: string,
  secret: string
): Promise<{ received: boolean; type: string }> {
  const stripe = getStripeClient()

  let event: ReturnType<typeof stripe.webhooks.constructEvent>
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, secret)
  } catch (err) {
    throw new BadRequestError(`Webhook signature verification failed: ${(err as Error).message}`)
  }

  const pool = getPool()

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as { metadata?: { org_id?: string } }
      if (session.metadata?.org_id) {
        await pool.query(
          `UPDATE subscriptions SET status = 'active' WHERE org_id = $1`,
          [session.metadata.org_id]
        )
      }
      break
    }
    case 'invoice.payment_succeeded': {
      const stripeInvoice = event.data.object as { metadata?: { invoice_id?: string } }
      if (stripeInvoice.metadata?.invoice_id) {
        await pool.query(
          `UPDATE invoices SET status = 'paid' WHERE id = $1`,
          [stripeInvoice.metadata.invoice_id]
        )
      }
      break
    }
    case 'customer.subscription.deleted': {
      const subscription = event.data.object as { metadata?: { org_id?: string } }
      if (subscription.metadata?.org_id) {
        await pool.query(
          `UPDATE subscriptions SET status = 'cancelled' WHERE org_id = $1`,
          [subscription.metadata.org_id]
        )
      }
      break
    }
    default:
      // Unhandled event type — log and acknowledge
      console.log(`Unhandled Stripe event type: ${event.type}`)
  }

  return { received: true, type: event.type }
}
