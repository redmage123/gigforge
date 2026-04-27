import type { PriceData } from '../../types/index'

// Fixed seed candle data for deterministic output
// BTC 1D - 30 candles starting ~$43,000
const BTC_1D_CANDLES = [
  { timestamp: 1706745600000, open: 42800, high: 43500, low: 42400, close: 43100, volume: 12500 },
  { timestamp: 1706832000000, open: 43100, high: 43800, low: 42900, close: 43600, volume: 11800 },
  { timestamp: 1706918400000, open: 43600, high: 44200, low: 43200, close: 43900, volume: 13200 },
  { timestamp: 1707004800000, open: 43900, high: 44500, low: 43600, close: 44100, volume: 10900 },
  { timestamp: 1707091200000, open: 44100, high: 44800, low: 43800, close: 44600, volume: 14300 },
  { timestamp: 1707177600000, open: 44600, high: 45200, low: 44200, close: 44900, volume: 12700 },
  { timestamp: 1707264000000, open: 44900, high: 45600, low: 44500, close: 45200, volume: 11500 },
  { timestamp: 1707350400000, open: 45200, high: 45900, low: 44800, close: 45500, volume: 13800 },
  { timestamp: 1707436800000, open: 45500, high: 46100, low: 45100, close: 45800, volume: 15200 },
  { timestamp: 1707523200000, open: 45800, high: 46400, low: 45400, close: 46100, volume: 12100 },
  { timestamp: 1707609600000, open: 46100, high: 46800, low: 45700, close: 46400, volume: 11200 },
  { timestamp: 1707696000000, open: 46400, high: 47200, low: 46000, close: 46800, volume: 14600 },
  { timestamp: 1707782400000, open: 46800, high: 47500, low: 46300, close: 47100, volume: 13400 },
  { timestamp: 1707868800000, open: 47100, high: 47800, low: 46700, close: 47400, volume: 12800 },
  { timestamp: 1707955200000, open: 47400, high: 48200, low: 47000, close: 47800, volume: 16200 },
  { timestamp: 1708041600000, open: 47800, high: 48500, low: 47300, close: 48100, volume: 14900 },
  { timestamp: 1708128000000, open: 48100, high: 48800, low: 47600, close: 48400, volume: 13600 },
  { timestamp: 1708214400000, open: 48400, high: 49200, low: 48000, close: 48900, volume: 15800 },
  { timestamp: 1708300800000, open: 48900, high: 49500, low: 48400, close: 49200, volume: 14200 },
  { timestamp: 1708387200000, open: 49200, high: 49800, low: 48700, close: 49500, volume: 11900 },
  { timestamp: 1708473600000, open: 49500, high: 50200, low: 49100, close: 49800, volume: 17300 },
  { timestamp: 1708560000000, open: 49800, high: 50500, low: 49300, close: 50200, volume: 16100 },
  { timestamp: 1708646400000, open: 50200, high: 51000, low: 49700, close: 50700, volume: 18400 },
  { timestamp: 1708732800000, open: 50700, high: 51500, low: 50200, close: 51100, volume: 15700 },
  { timestamp: 1708819200000, open: 51100, high: 51800, low: 50600, close: 51400, volume: 14300 },
  { timestamp: 1708905600000, open: 51400, high: 52200, low: 51000, close: 51900, volume: 16800 },
  { timestamp: 1708992000000, open: 51900, high: 52600, low: 51500, close: 52300, volume: 13900 },
  { timestamp: 1709078400000, open: 52300, high: 53000, low: 51800, close: 52700, volume: 15400 },
  { timestamp: 1709164800000, open: 52700, high: 53500, low: 52200, close: 53100, volume: 17200 },
  { timestamp: 1709251200000, open: 53100, high: 53800, low: 52600, close: 53500, volume: 14800 },
]

// BTC 1W - weekly candles
const BTC_1W_CANDLES = [
  { timestamp: 1704067200000, open: 42000, high: 44500, low: 41200, close: 43800, volume: 85000 },
  { timestamp: 1704672000000, open: 43800, high: 45200, low: 43100, close: 44600, volume: 78000 },
  { timestamp: 1705276800000, open: 44600, high: 46000, low: 43900, close: 45400, volume: 92000 },
  { timestamp: 1705881600000, open: 45400, high: 47200, low: 44800, close: 46900, volume: 88000 },
  { timestamp: 1706486400000, open: 46900, high: 48500, low: 46200, close: 47800, volume: 95000 },
  { timestamp: 1707091200000, open: 47800, high: 49500, low: 47100, close: 48900, volume: 102000 },
  { timestamp: 1707696000000, open: 48900, high: 50200, low: 48200, close: 49700, volume: 89000 },
  { timestamp: 1708300800000, open: 49700, high: 51500, low: 49000, close: 50800, volume: 98000 },
  { timestamp: 1708905600000, open: 50800, high: 52500, low: 50100, close: 51900, volume: 105000 },
  { timestamp: 1709510400000, open: 51900, high: 53800, low: 51200, close: 52900, volume: 112000 },
  { timestamp: 1710115200000, open: 52900, high: 55000, low: 52200, close: 54200, volume: 118000 },
  { timestamp: 1710720000000, open: 54200, high: 56500, low: 53500, close: 55600, volume: 125000 },
  { timestamp: 1711324800000, open: 55600, high: 57800, low: 54800, close: 56800, volume: 115000 },
  { timestamp: 1711929600000, open: 56800, high: 59200, low: 56000, close: 58500, volume: 135000 },
  { timestamp: 1712534400000, open: 58500, high: 61000, low: 57800, close: 60200, volume: 142000 },
  { timestamp: 1713139200000, open: 60200, high: 63500, low: 59400, close: 62100, volume: 158000 },
  { timestamp: 1713744000000, open: 62100, high: 65000, low: 61200, close: 63800, volume: 145000 },
  { timestamp: 1714348800000, open: 63800, high: 67200, low: 63000, close: 66100, volume: 162000 },
  { timestamp: 1714953600000, open: 66100, high: 69500, low: 65200, close: 68400, volume: 178000 },
  { timestamp: 1715558400000, open: 68400, high: 71000, low: 67500, close: 69800, volume: 165000 },
  { timestamp: 1716163200000, open: 69800, high: 72500, low: 68900, close: 71200, volume: 172000 },
  { timestamp: 1716768000000, open: 71200, high: 74000, low: 70400, close: 72800, volume: 158000 },
  { timestamp: 1717372800000, open: 72800, high: 75500, low: 71900, close: 74100, volume: 168000 },
  { timestamp: 1717977600000, open: 74100, high: 77000, low: 73200, close: 75900, volume: 182000 },
  { timestamp: 1718582400000, open: 75900, high: 78500, low: 75000, close: 77200, volume: 175000 },
  { timestamp: 1719187200000, open: 77200, high: 80000, low: 76300, close: 78800, volume: 192000 },
  { timestamp: 1719792000000, open: 78800, high: 81500, low: 77900, close: 80200, volume: 185000 },
  { timestamp: 1720396800000, open: 80200, high: 83000, low: 79300, close: 81800, volume: 198000 },
  { timestamp: 1721001600000, open: 81800, high: 84500, low: 80900, close: 83200, volume: 205000 },
  { timestamp: 1721606400000, open: 83200, high: 86000, low: 82300, close: 84800, volume: 212000 },
]

// BTC 1M - monthly candles
const BTC_1M_CANDLES = [
  { timestamp: 1696118400000, open: 27000, high: 28500, low: 26200, close: 27800, volume: 380000 },
  { timestamp: 1698796800000, open: 27800, high: 31500, low: 27200, close: 30800, volume: 420000 },
  { timestamp: 1701388800000, open: 30800, high: 38500, low: 30200, close: 37200, volume: 580000 },
  { timestamp: 1704067200000, open: 37200, high: 45000, low: 36800, close: 43500, volume: 650000 },
  { timestamp: 1706745600000, open: 43500, high: 52000, low: 42800, close: 48900, volume: 720000 },
  { timestamp: 1709251200000, open: 48900, high: 68000, low: 48200, close: 61200, volume: 850000 },
  { timestamp: 1711929600000, open: 61200, high: 73750, low: 59800, close: 66500, volume: 780000 },
  { timestamp: 1714521600000, open: 66500, high: 72000, low: 56500, close: 60200, volume: 690000 },
  { timestamp: 1717200000000, open: 60200, high: 71500, low: 58800, close: 67200, volume: 710000 },
  { timestamp: 1719792000000, open: 67200, high: 74000, low: 53500, close: 57800, volume: 620000 },
  { timestamp: 1722470400000, open: 57800, high: 68000, low: 49000, close: 65000, volume: 680000 },
  { timestamp: 1725148800000, open: 65000, high: 68500, low: 52000, close: 60500, volume: 590000 },
  { timestamp: 1727740800000, open: 60500, high: 73000, low: 59200, close: 71200, volume: 740000 },
  { timestamp: 1730419200000, open: 71200, high: 99500, low: 70500, close: 98200, volume: 1200000 },
  { timestamp: 1733011200000, open: 98200, high: 106000, low: 91500, close: 97500, volume: 980000 },
  { timestamp: 1735689600000, open: 97500, high: 108000, low: 89000, close: 102800, volume: 1100000 },
  { timestamp: 1738368000000, open: 102800, high: 110000, low: 78000, close: 84000, volume: 920000 },
  { timestamp: 1740787200000, open: 84000, high: 95000, low: 76500, close: 88000, volume: 850000 },
  { timestamp: 1743465600000, open: 88000, high: 92000, low: 79000, close: 85000, volume: 790000 },
  { timestamp: 1746057600000, open: 85000, high: 99000, low: 84000, close: 96000, volume: 880000 },
  { timestamp: 1748736000000, open: 96000, high: 105000, low: 93000, close: 101000, volume: 950000 },
  { timestamp: 1751328000000, open: 101000, high: 112000, low: 99000, close: 108000, volume: 1050000 },
  { timestamp: 1754006400000, open: 108000, high: 118000, low: 105000, close: 115000, volume: 1120000 },
  { timestamp: 1756684800000, open: 115000, high: 125000, low: 112000, close: 120000, volume: 1080000 },
  { timestamp: 1759363200000, open: 120000, high: 132000, low: 118000, close: 128000, volume: 1150000 },
  { timestamp: 1761955200000, open: 128000, high: 140000, low: 125000, close: 136000, volume: 1220000 },
  { timestamp: 1764633600000, open: 136000, high: 148000, low: 133000, close: 144000, volume: 1290000 },
  { timestamp: 1767225600000, open: 144000, high: 158000, low: 141000, close: 153000, volume: 1350000 },
  { timestamp: 1769904000000, open: 153000, high: 165000, low: 150000, close: 161000, volume: 1410000 },
  { timestamp: 1772582400000, open: 161000, high: 172000, low: 158000, close: 168000, volume: 1380000 },
]

// ETH base prices ~$2300
function scaleCandles(
  candles: typeof BTC_1D_CANDLES,
  ratio: number,
  volumeRatio: number
): typeof BTC_1D_CANDLES {
  return candles.map((c) => ({
    timestamp: c.timestamp,
    open: Math.round(c.open * ratio * 100) / 100,
    high: Math.round(c.high * ratio * 100) / 100,
    low: Math.round(c.low * ratio * 100) / 100,
    close: Math.round(c.close * ratio * 100) / 100,
    volume: Math.round(c.volume * volumeRatio),
  }))
}

const PRICE_DATA: Record<string, Record<string, PriceData>> = {
  BTC: {
    '1D': { asset: 'BTC', timeframe: '1D', candles: BTC_1D_CANDLES },
    '1W': { asset: 'BTC', timeframe: '1W', candles: BTC_1W_CANDLES },
    '1M': { asset: 'BTC', timeframe: '1M', candles: BTC_1M_CANDLES },
  },
  ETH: {
    '1D': { asset: 'ETH', timeframe: '1D', candles: scaleCandles(BTC_1D_CANDLES, 0.0534, 3.2) },
    '1W': { asset: 'ETH', timeframe: '1W', candles: scaleCandles(BTC_1W_CANDLES, 0.0534, 3.2) },
    '1M': { asset: 'ETH', timeframe: '1M', candles: scaleCandles(BTC_1M_CANDLES, 0.0534, 3.2) },
  },
  SOL: {
    '1D': { asset: 'SOL', timeframe: '1D', candles: scaleCandles(BTC_1D_CANDLES, 0.00243, 8.5) },
    '1W': { asset: 'SOL', timeframe: '1W', candles: scaleCandles(BTC_1W_CANDLES, 0.00243, 8.5) },
    '1M': { asset: 'SOL', timeframe: '1M', candles: scaleCandles(BTC_1M_CANDLES, 0.00243, 8.5) },
  },
  ADA: {
    '1D': { asset: 'ADA', timeframe: '1D', candles: scaleCandles(BTC_1D_CANDLES, 0.0000111, 42) },
    '1W': { asset: 'ADA', timeframe: '1W', candles: scaleCandles(BTC_1W_CANDLES, 0.0000111, 42) },
    '1M': { asset: 'ADA', timeframe: '1M', candles: scaleCandles(BTC_1M_CANDLES, 0.0000111, 42) },
  },
}

export async function getPrices(asset: string, timeframe: '1D' | '1W' | '1M'): Promise<PriceData> {
  await new Promise((r) => setTimeout(r, 150))
  const assetData = PRICE_DATA[asset] ?? PRICE_DATA['BTC']
  const tfData = assetData[timeframe] ?? assetData['1D']
  return tfData
}
