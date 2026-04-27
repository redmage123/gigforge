import type { WatchlistItem } from '../../types/index'

const MOCK_WATCHLIST: WatchlistItem[] = [
  {
    asset: 'Bitcoin',
    symbol: 'BTC',
    currentPrice: 43210.50,
    change24h: 1250.30,
    changePct24h: 2.98,
    sparkline: [41200, 41800, 42100, 42500, 42200, 42800, 43000, 43100, 42900, 43050, 43100, 43210],
  },
  {
    asset: 'Ethereum',
    symbol: 'ETH',
    currentPrice: 3240.75,
    change24h: 88.40,
    changePct24h: 2.80,
    sparkline: [3050, 3100, 3120, 3180, 3150, 3200, 3220, 3230, 3210, 3225, 3235, 3240],
  },
  {
    asset: 'Solana',
    symbol: 'SOL',
    currentPrice: 142.30,
    change24h: -3.20,
    changePct24h: -2.20,
    sparkline: [148, 147, 146, 145, 144, 145, 143, 144, 143, 142, 142, 142],
  },
  {
    asset: 'Cardano',
    symbol: 'ADA',
    currentPrice: 0.549,
    change24h: -0.012,
    changePct24h: -2.14,
    sparkline: [0.57, 0.565, 0.56, 0.558, 0.555, 0.553, 0.552, 0.551, 0.550, 0.550, 0.549, 0.549],
  },
  {
    asset: 'Binance Coin',
    symbol: 'BNB',
    currentPrice: 418.20,
    change24h: 12.80,
    changePct24h: 3.16,
    sparkline: [395, 398, 402, 408, 405, 410, 412, 415, 413, 416, 417, 418],
  },
  {
    asset: 'XRP',
    symbol: 'XRP',
    currentPrice: 0.6180,
    change24h: 0.0185,
    changePct24h: 3.09,
    sparkline: [0.58, 0.585, 0.590, 0.595, 0.592, 0.598, 0.602, 0.610, 0.612, 0.615, 0.616, 0.618],
  },
]

export async function getWatchlist(): Promise<WatchlistItem[]> {
  await new Promise((r) => setTimeout(r, 150))
  return MOCK_WATCHLIST
}
