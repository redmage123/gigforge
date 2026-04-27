import type { Alert } from '../../types/index'

const MOCK_ALERTS: Alert[] = [
  {
    id: 'alert-001',
    asset: 'BTC',
    condition: 'above',
    threshold: 50000,
    currentPrice: 43210.50,
    triggered: false,
    createdAt: '2026-03-20T10:00:00Z',
  },
  {
    id: 'alert-002',
    asset: 'ETH',
    condition: 'below',
    threshold: 2200,
    currentPrice: 3240.75,
    triggered: false,
    createdAt: '2026-03-20T11:30:00Z',
  },
  {
    id: 'alert-003',
    asset: 'SOL',
    condition: 'above',
    threshold: 130,
    currentPrice: 142.30,
    triggered: true,
    createdAt: '2026-03-19T08:00:00Z',
  },
  {
    id: 'alert-004',
    asset: 'ADA',
    condition: 'below',
    threshold: 0.60,
    currentPrice: 0.549,
    triggered: true,
    createdAt: '2026-03-18T14:00:00Z',
  },
  {
    id: 'alert-005',
    asset: 'BTC',
    condition: 'below',
    threshold: 40000,
    currentPrice: 43210.50,
    triggered: false,
    createdAt: '2026-03-21T09:00:00Z',
  },
  {
    id: 'alert-006',
    asset: 'ETH',
    condition: 'above',
    threshold: 3500,
    currentPrice: 3240.75,
    triggered: false,
    createdAt: '2026-03-21T16:00:00Z',
  },
]

export async function getAlerts(): Promise<Alert[]> {
  await new Promise((r) => setTimeout(r, 150))
  return MOCK_ALERTS
}
