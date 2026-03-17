"""Multi-exchange order book aggregation service."""

import httpx
from cachetools import TTLCache

_cache = TTLCache(maxsize=64, ttl=5)
_TIMEOUT = 10.0

# Coin name → exchange symbol mappings
SYMBOL_MAP = {
    "BTC": {"binance": "BTCUSDT", "coinbase": "BTC-USD"},
    "ETH": {"binance": "ETHUSDT", "coinbase": "ETH-USD"},
    "SOL": {"binance": "SOLUSDT", "coinbase": "SOL-USD"},
    "ADA": {"binance": "ADAUSDT", "coinbase": "ADA-USD"},
    "DOT": {"binance": "DOTUSDT", "coinbase": "DOT-USD"},
    "AVAX": {"binance": "AVAXUSDT", "coinbase": "AVAX-USD"},
    "MATIC": {"binance": "MATICUSDT", "coinbase": "MATIC-USD"},
    "LINK": {"binance": "LINKUSDT", "coinbase": "LINK-USD"},
    "UNI": {"binance": "UNIUSDT", "coinbase": "UNI-USD"},
    "AAVE": {"binance": "AAVEUSDT", "coinbase": "AAVE-USD"},
    "ARB": {"binance": "ARBUSDT", "coinbase": "ARB-USD"},
    "OP": {"binance": "OPUSDT", "coinbase": "OP-USD"},
    "DOGE": {"binance": "DOGEUSDT", "coinbase": "DOGE-USD"},
    "XRP": {"binance": "XRPUSDT", "coinbase": "XRP-USD"},
}


async def get_binance_orderbook(symbol: str, limit: int = 20) -> dict:
    """Fetch order book from Binance."""
    url = f"https://api.binance.com/api/v3/depth?symbol={symbol}&limit={limit}"
    cache_key = f"binance_{symbol}_{limit}"
    if cache_key in _cache:
        return _cache[cache_key]

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            data = resp.json()
            result = {
                "bids": [[float(p), float(q)] for p, q in data.get("bids", [])],
                "asks": [[float(p), float(q)] for p, q in data.get("asks", [])],
                "exchange": "binance",
                "symbol": symbol,
            }
            _cache[cache_key] = result
            return result
    except Exception as e:
        return {"bids": [], "asks": [], "exchange": "binance", "symbol": symbol, "error": str(e)}


async def get_coinbase_orderbook(product_id: str, level: int = 2) -> dict:
    """Fetch order book from Coinbase."""
    url = f"https://api.exchange.coinbase.com/products/{product_id}/book?level={level}"
    cache_key = f"coinbase_{product_id}_{level}"
    if cache_key in _cache:
        return _cache[cache_key]

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            data = resp.json()
            result = {
                "bids": [[float(p), float(q)] for p, q, _ in data.get("bids", [])],
                "asks": [[float(p), float(q)] for p, q, _ in data.get("asks", [])],
                "exchange": "coinbase",
                "product_id": product_id,
            }
            _cache[cache_key] = result
            return result
    except Exception as e:
        return {"bids": [], "asks": [], "exchange": "coinbase", "product_id": product_id, "error": str(e)}


async def get_aggregated_orderbook(coin: str) -> dict:
    """Aggregate order books from multiple exchanges for a given coin."""
    coin_upper = coin.upper()
    mapping = SYMBOL_MAP.get(coin_upper)
    if not mapping:
        return {"error": f"Unknown coin: {coin}. Supported: {list(SYMBOL_MAP.keys())}"}

    cache_key = f"agg_{coin_upper}"
    if cache_key in _cache:
        return _cache[cache_key]

    binance_data = await get_binance_orderbook(mapping["binance"])
    coinbase_data = await get_coinbase_orderbook(mapping["coinbase"])

    # Merge bids: [[price, qty, exchange], ...] sorted descending by price
    merged_bids: list[list] = []
    for p, q in binance_data.get("bids", []):
        merged_bids.append([p, q, "binance"])
    for p, q in coinbase_data.get("bids", []):
        merged_bids.append([p, q, "coinbase"])
    merged_bids.sort(key=lambda x: x[0], reverse=True)

    # Merge asks: sorted ascending by price
    merged_asks: list[list] = []
    for p, q in binance_data.get("asks", []):
        merged_asks.append([p, q, "binance"])
    for p, q in coinbase_data.get("asks", []):
        merged_asks.append([p, q, "coinbase"])
    merged_asks.sort(key=lambda x: x[0])

    best_bid = merged_bids[0][0] if merged_bids else 0.0
    best_ask = merged_asks[0][0] if merged_asks else 0.0
    spread = best_ask - best_bid if best_ask and best_bid else 0.0
    mid_price = (best_ask + best_bid) / 2 if best_ask and best_bid else 0.0

    result = {
        "coin": coin_upper,
        "bids": merged_bids,
        "asks": merged_asks,
        "spread": round(spread, 8),
        "mid_price": round(mid_price, 8),
        "sources": {
            "binance": {"error": binance_data.get("error")},
            "coinbase": {"error": coinbase_data.get("error")},
        },
    }
    _cache[cache_key] = result
    return result
