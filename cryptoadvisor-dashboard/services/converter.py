"""Cryptocurrency converter service — crypto-to-crypto and crypto-to-fiat rates via CoinGecko."""

import logging
import httpx
from config import COINGECKO_API
from services.cache import cached

logger = logging.getLogger(__name__)

# Stale cache for rate-limit resilience
_stale_rates: dict | None = None

# Supported fiat currencies
FIAT_CURRENCIES = {
    "usd": {"name": "US Dollar", "symbol": "$"},
    "cad": {"name": "Canadian Dollar", "symbol": "CA$"},
    "eur": {"name": "Euro", "symbol": "\u20ac"},
    "gbp": {"name": "British Pound", "symbol": "\u00a3"},
    "jpy": {"name": "Japanese Yen", "symbol": "\u00a5"},
    "mxn": {"name": "Mexican Peso", "symbol": "MX$"},
    "uah": {"name": "Ukrainian Hryvnia", "symbol": "\u20b4"},
    "sek": {"name": "Swedish Krona", "symbol": "kr"},
    "nok": {"name": "Norwegian Krone", "symbol": "kr"},
    "aud": {"name": "Australian Dollar", "symbol": "A$"},
    "chf": {"name": "Swiss Franc", "symbol": "CHF"},
    "cny": {"name": "Chinese Yuan", "symbol": "\u00a5"},
    "inr": {"name": "Indian Rupee", "symbol": "\u20b9"},
    "brl": {"name": "Brazilian Real", "symbol": "R$"},
    "krw": {"name": "South Korean Won", "symbol": "\u20a9"},
    "try": {"name": "Turkish Lira", "symbol": "\u20ba"},
}

# Popular crypto coins (CoinGecko IDs)
CRYPTO_COINS = [
    {"id": "bitcoin", "symbol": "BTC", "name": "Bitcoin"},
    {"id": "ethereum", "symbol": "ETH", "name": "Ethereum"},
    {"id": "solana", "symbol": "SOL", "name": "Solana"},
    {"id": "binancecoin", "symbol": "BNB", "name": "BNB"},
    {"id": "cardano", "symbol": "ADA", "name": "Cardano"},
    {"id": "ripple", "symbol": "XRP", "name": "XRP"},
    {"id": "polkadot", "symbol": "DOT", "name": "Polkadot"},
    {"id": "avalanche-2", "symbol": "AVAX", "name": "Avalanche"},
    {"id": "chainlink", "symbol": "LINK", "name": "Chainlink"},
    {"id": "dogecoin", "symbol": "DOGE", "name": "Dogecoin"},
    {"id": "matic-network", "symbol": "MATIC", "name": "Polygon"},
    {"id": "litecoin", "symbol": "LTC", "name": "Litecoin"},
    {"id": "uniswap", "symbol": "UNI", "name": "Uniswap"},
    {"id": "cosmos", "symbol": "ATOM", "name": "Cosmos"},
    {"id": "stellar", "symbol": "XLM", "name": "Stellar"},
    {"id": "tether", "symbol": "USDT", "name": "Tether"},
    {"id": "usd-coin", "symbol": "USDC", "name": "USD Coin"},
    {"id": "tron", "symbol": "TRX", "name": "TRON"},
    {"id": "near", "symbol": "NEAR", "name": "NEAR Protocol"},
    {"id": "sui", "symbol": "SUI", "name": "Sui"},
]

# All fiat codes for CoinGecko vs_currencies param
_FIAT_CODES = ",".join(FIAT_CURRENCIES.keys())
_CRYPTO_IDS = ",".join(c["id"] for c in CRYPTO_COINS)


@cached(ttl=60)
async def get_rates() -> dict:
    """Fetch all crypto prices in all fiat currencies + BTC/ETH for cross-crypto conversion."""
    global _stale_rates
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                f"{COINGECKO_API}/simple/price",
                params={
                    "ids": _CRYPTO_IDS,
                    "vs_currencies": f"{_FIAT_CODES},btc,eth",
                },
            )
            resp.raise_for_status()
            data = resp.json()
            _stale_rates = data
            return data
    except (httpx.HTTPStatusError, httpx.RequestError) as exc:
        logger.warning("CoinGecko converter request failed: %s", exc)
        if _stale_rates:
            logger.info("Returning stale converter rates")
            return _stale_rates
        raise


def convert_crypto(rates: dict, from_coin: str, to_coin: str, amount: float) -> dict | None:
    """Convert between two cryptocurrencies using USD as intermediary."""
    from_data = rates.get(from_coin)
    to_data = rates.get(to_coin)
    if not from_data or not to_data:
        return None
    from_usd = from_data.get("usd", 0)
    to_usd = to_data.get("usd", 0)
    if from_usd == 0 or to_usd == 0:
        return None
    result = (from_usd / to_usd) * amount
    return {
        "from": from_coin,
        "to": to_coin,
        "amount": amount,
        "result": result,
        "rate": from_usd / to_usd,
        "from_usd": from_usd,
        "to_usd": to_usd,
    }


def convert_to_fiats(rates: dict, coin_id: str, amount: float) -> list[dict]:
    """Get the value of a crypto amount in all supported fiat currencies."""
    coin_data = rates.get(coin_id)
    if not coin_data:
        return []
    results = []
    for code, info in FIAT_CURRENCIES.items():
        price = coin_data.get(code, 0)
        if price:
            results.append({
                "currency": code.upper(),
                "name": info["name"],
                "symbol": info["symbol"],
                "rate": price,
                "value": price * amount,
            })
    return results


def get_supported_assets() -> dict:
    """Return lists of supported cryptos and fiats."""
    return {
        "cryptos": CRYPTO_COINS,
        "fiats": [
            {"code": k.upper(), **v} for k, v in FIAT_CURRENCIES.items()
        ],
    }
