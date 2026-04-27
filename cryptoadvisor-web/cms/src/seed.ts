import type { Payload } from 'payload'

interface AssetSeed {
  name: string
  symbol: string
  description?: string
  riskTier: 'low' | 'medium' | 'high'
  marketCapTier: 'large' | 'mid' | 'small'
  chain?: string
  exchanges: { name: string }[]
}

interface SignalSeed {
  assetSymbol: string
  assetName: string
  direction: 'BUY' | 'SELL' | 'HOLD'
  confidence: number
  reason: string
}

const ASSETS: AssetSeed[] = [
  {
    name: 'Bitcoin',
    symbol: 'BTC',
    description: 'The original peer-to-peer electronic cash system.',
    riskTier: 'low',
    marketCapTier: 'large',
    chain: 'Bitcoin',
    exchanges: [{ name: 'Binance' }, { name: 'Coinbase' }, { name: 'Kraken' }],
  },
  {
    name: 'Ethereum',
    symbol: 'ETH',
    description: 'Decentralised smart-contract platform.',
    riskTier: 'low',
    marketCapTier: 'large',
    chain: 'Ethereum',
    exchanges: [{ name: 'Binance' }, { name: 'Coinbase' }, { name: 'Kraken' }],
  },
  {
    name: 'Solana',
    symbol: 'SOL',
    description: 'High-throughput proof-of-stake L1.',
    riskTier: 'medium',
    marketCapTier: 'large',
    chain: 'Solana',
    exchanges: [{ name: 'Binance' }, { name: 'Coinbase' }],
  },
  {
    name: 'Cardano',
    symbol: 'ADA',
    description: 'Research-driven proof-of-stake L1.',
    riskTier: 'medium',
    marketCapTier: 'mid',
    chain: 'Cardano',
    exchanges: [{ name: 'Binance' }, { name: 'Kraken' }],
  },
  {
    name: 'Avalanche',
    symbol: 'AVAX',
    description: 'Subnet-based scalable L1 with EVM compatibility.',
    riskTier: 'high',
    marketCapTier: 'mid',
    chain: 'Avalanche',
    exchanges: [{ name: 'Binance' }, { name: 'Coinbase' }],
  },
  {
    name: 'Chainlink',
    symbol: 'LINK',
    description: 'Decentralised oracle network for off-chain data.',
    riskTier: 'high',
    marketCapTier: 'small',
    chain: 'Ethereum',
    exchanges: [{ name: 'Binance' }, { name: 'Coinbase' }, { name: 'Kraken' }],
  },
]

const SIGNALS: SignalSeed[] = [
  {
    assetSymbol: 'BTC',
    assetName: 'Bitcoin',
    direction: 'BUY',
    confidence: 82,
    reason:
      'RSI below 30 on the weekly chart; MACD bullish crossover forming; on-chain accumulation by long-term holders increasing.',
  },
  {
    assetSymbol: 'ETH',
    assetName: 'Ethereum',
    direction: 'HOLD',
    confidence: 61,
    reason:
      'Price consolidating in the $3,100–$3,300 range; staking yield stable; gas fees trending down post-Dencun. Await breakout confirmation.',
  },
  {
    assetSymbol: 'SOL',
    assetName: 'Solana',
    direction: 'BUY',
    confidence: 74,
    reason:
      'Network TPS hitting all-time highs; DeFi TVL growing; technical pattern shows cup-and-handle breakout in progress.',
  },
  {
    assetSymbol: 'ADA',
    assetName: 'Cardano',
    direction: 'SELL',
    confidence: 55,
    reason:
      'Project roadmap delivery repeatedly delayed; declining developer activity on GitHub; price rejected from 200-day MA.',
  },
  {
    assetSymbol: 'AVAX',
    assetName: 'Avalanche',
    direction: 'BUY',
    confidence: 68,
    reason:
      'Subnet ecosystem expansion; institutional interest increasing; relative strength vs BTC improving over 30-day window.',
  },
]

export async function seedDatabase(payload: Payload): Promise<void> {
  // Idempotent seed: skip if assets already exist.
  const existing = await payload.find({ collection: 'assets', limit: 1 })
  if (existing.totalDocs > 0) {
    return
  }

  for (const asset of ASSETS) {
    await payload.create({ collection: 'assets', data: asset })
  }

  for (const signal of SIGNALS) {
    await payload.create({
      collection: 'signals',
      data: { ...signal, generatedAt: new Date().toISOString() },
    })
  }
}
