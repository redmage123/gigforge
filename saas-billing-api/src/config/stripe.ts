import Stripe from 'stripe'

let client: Stripe | null = null

export function getStripeClient(): Stripe {
  if (!client) {
    client = new Stripe(process.env.STRIPE_SECRET_KEY ?? 'sk_test_mock', {
      apiVersion: '2023-10-16',
    })
  }
  return client
}
