"""Multi-currency conversion service with caching.

Uses exchangerate.host (free tier) for live rates. Falls back to
static approximate rates if the API is unreachable.
"""

import httpx
from cachetools import TTLCache

# Cache exchange rates for 1 hour
_rate_cache: TTLCache = TTLCache(maxsize=1, ttl=3600)
_CACHE_KEY = "usd_rates"

SUPPORTED_CURRENCIES = [
    "USD", "EUR", "GBP", "JPY", "CAD", "AUD", "CHF", "CNY", "KRW", "BRL",
]

SYMBOLS: dict[str, str] = {
    "USD": "$",
    "EUR": "\u20ac",
    "GBP": "\u00a3",
    "JPY": "\u00a5",
    "CAD": "C$",
    "AUD": "A$",
    "CHF": "Fr",
    "CNY": "\u00a5",
    "KRW": "\u20a9",
    "BRL": "R$",
}

# Fallback rates (approximate, USD-based) used when the API is unavailable
_FALLBACK_RATES: dict[str, float] = {
    "USD": 1.0,
    "EUR": 0.92,
    "GBP": 0.79,
    "JPY": 149.5,
    "CAD": 1.36,
    "AUD": 1.53,
    "CHF": 0.88,
    "CNY": 7.24,
    "KRW": 1320.0,
    "BRL": 4.97,
}

# Decimal places per currency (0 for zero-decimal currencies)
_DECIMALS: dict[str, int] = {
    "JPY": 0,
    "KRW": 0,
}


def get_exchange_rates() -> dict[str, float]:
    """Fetch USD-based exchange rates (cached for 1 hour).

    Returns a dict mapping currency code to its rate relative to 1 USD.
    """
    cached = _rate_cache.get(_CACHE_KEY)
    if cached is not None:
        return cached

    try:
        resp = httpx.get(
            "https://api.exchangerate.host/latest",
            params={"base": "USD", "symbols": ",".join(SUPPORTED_CURRENCIES)},
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
        rates = data.get("rates", {})
        # Ensure all supported currencies are present
        if rates and all(c in rates for c in SUPPORTED_CURRENCIES):
            _rate_cache[_CACHE_KEY] = rates
            return rates
    except Exception:
        pass

    # Fallback to static rates
    _rate_cache[_CACHE_KEY] = _FALLBACK_RATES
    return _FALLBACK_RATES


def convert(amount_usd: float, target_currency: str) -> float:
    """Convert a USD amount to the target currency."""
    if target_currency == "USD":
        return amount_usd
    rates = get_exchange_rates()
    rate = rates.get(target_currency)
    if rate is None:
        raise ValueError(f"Unsupported currency: {target_currency}")
    return amount_usd * rate


def get_supported_currencies() -> list[str]:
    """Return the list of supported currency codes."""
    return list(SUPPORTED_CURRENCIES)


def format_currency(amount: float, currency: str) -> str:
    """Format a monetary amount with the appropriate symbol and decimals.

    Examples:
        format_currency(1234.56, "USD") -> "$1,234.56"
        format_currency(150000, "JPY")  -> "\\u00a5150,000"
    """
    symbol = SYMBOLS.get(currency, currency + " ")
    decimals = _DECIMALS.get(currency, 2)

    if decimals == 0:
        formatted = f"{amount:,.0f}"
    else:
        formatted = f"{amount:,.{decimals}f}"

    return f"{symbol}{formatted}"
