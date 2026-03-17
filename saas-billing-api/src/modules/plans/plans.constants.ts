export const PLANS = {
  free: {
    id: 'free',
    name: 'Free',
    priceUsd: 0,
    monthlyRequests: 1000,
    seats: 1,
    overageRateCents: 0,
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    priceUsd: 49,
    monthlyRequests: 50000,
    seats: 5,
    overageRateCents: 0.1,
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    priceUsd: 299,
    monthlyRequests: null,
    seats: 50,
    overageRateCents: 0,
  },
} as const

export type PlanId = keyof typeof PLANS
export type Plan = (typeof PLANS)[PlanId]
