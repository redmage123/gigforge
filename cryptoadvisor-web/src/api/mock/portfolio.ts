import type { Portfolio } from '../../types/index'

const MOCK_PORTFOLIO: Portfolio = {
  totalValue: 124350.78,
  change24h: 2847.32,
  changePct24h: 2.34,
  sparkline: [115000, 117200, 116800, 118500, 119200, 121000, 120500, 122300, 123100, 122800, 124000, 124350],
  holdings: [
    {
      asset: 'Bitcoin',
      symbol: 'BTC',
      amount: 1.23456,
      avgBuyPrice: 38200.00,
      currentPrice: 43210.50,
      value: 53334.60,
      allocationPct: 42.89,
      pnl: 6185.49,
      pnlPct: 13.11,
      sparkline: [40000, 40800, 41200, 42000, 41500, 42800, 43000, 43210, 42900, 43100, 43000, 43210],
    },
    {
      asset: 'Ethereum',
      symbol: 'ETH',
      amount: 8.5,
      avgBuyPrice: 2850.00,
      currentPrice: 3240.75,
      value: 27546.38,
      allocationPct: 22.15,
      pnl: 3317.88,
      pnlPct: 13.67,
      sparkline: [2900, 2950, 3000, 3100, 3050, 3150, 3200, 3240, 3220, 3250, 3230, 3240],
    },
    {
      asset: 'Solana',
      symbol: 'SOL',
      amount: 120.0,
      avgBuyPrice: 95.50,
      currentPrice: 142.30,
      value: 17076.00,
      allocationPct: 13.73,
      pnl: 5616.00,
      pnlPct: 48.95,
      sparkline: [100, 110, 120, 130, 125, 135, 138, 140, 141, 142, 141, 142],
    },
    {
      asset: 'Cardano',
      symbol: 'ADA',
      amount: 15000.0,
      avgBuyPrice: 0.62,
      currentPrice: 0.549,
      value: 8235.00,
      allocationPct: 6.62,
      pnl: -1065.00,
      pnlPct: -11.45,
      sparkline: [0.62, 0.60, 0.58, 0.57, 0.55, 0.56, 0.55, 0.54, 0.55, 0.55, 0.549, 0.549],
    },
    {
      asset: 'Cash (USD)',
      symbol: 'USD',
      amount: 18158.80,
      avgBuyPrice: 1.0,
      currentPrice: 1.0,
      value: 18158.80,
      allocationPct: 14.60,
      pnl: 0,
      pnlPct: 0,
      sparkline: [18158, 18158, 18158, 18158, 18158, 18158, 18158, 18158, 18158, 18158, 18158, 18158],
    },
  ],
}

export async function getPortfolio(): Promise<Portfolio> {
  await new Promise((r) => setTimeout(r, 150))
  return MOCK_PORTFOLIO
}
