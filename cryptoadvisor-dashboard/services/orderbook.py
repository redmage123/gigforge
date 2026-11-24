"""Order book from Binance spot's free public depth endpoint (no API key).

Any crypto instrument with a Binance spot USDT pair works; the registry maps it to the Binance symbol
(inst.providers["binance"]). Books are cached for a few seconds so polling pages stay polite.
"""

import time

import httpx

from services import market
from services.market import registry
from services.market.models import make_id

HOSTS = ("https://api.binance.com", "https://data-api.binance.vision")
CACHE_S = 3.0
MAX_DEPTH = 100  # Binance charges the same request weight for any limit up to 100: fetch once, slice
_UA = {"User-Agent": "Mozilla/5.0 AssetAdvisor"}
_cache: dict[str, tuple[float, dict]] = {}


class OrderbookError(Exception):
    """A readable failure: `status` is the HTTP status the API should answer with."""

    def __init__(self, message: str, status: int = 502):
        super().__init__(message)
        self.status = status


def resolve_instrument_id(ref: str) -> str:
    """"crypto:BTC" stays as is; a CoinGecko id ("bitcoin") or a bare symbol ("btc") becomes crypto:<SYM>."""
    ref = (ref or "").strip()
    if ":" in ref:
        return ref
    return registry.from_coingecko_id(ref.lower()) or make_id("crypto", ref)


def parse_depth(payload: dict, depth: int) -> dict:
    """Binance depth payload -> sorted levels plus best bid/ask, spread and mid price (pure)."""
    def levels(rows, reverse):
        out = [{"price": float(p), "quantity": float(q), "exchange": "binance"} for p, q in rows or []]
        out = [lv for lv in out if lv["price"] > 0 and lv["quantity"] > 0]
        out.sort(key=lambda lv: lv["price"], reverse=reverse)
        return out[:depth]

    bids, asks = levels(payload.get("bids"), True), levels(payload.get("asks"), False)
    best_bid = bids[0]["price"] if bids else None
    best_ask = asks[0]["price"] if asks else None
    spread = mid = spread_pct = None
    if best_bid is not None and best_ask is not None:
        spread = round(best_ask - best_bid, 10)  # drop float noise (0.0100000000020 -> 0.01)
        mid = round((best_ask + best_bid) / 2, 10)
        spread_pct = spread / mid * 100 if mid else None
    return {"bids": bids, "asks": asks, "best_bid": best_bid, "best_ask": best_ask,
            "spread": spread, "mid_price": mid, "spread_pct": spread_pct}


async def _fetch_depth(symbol: str, limit: int) -> dict:
    last = None
    async with httpx.AsyncClient(timeout=10, headers=_UA) as client:
        for host in HOSTS:
            try:
                r = await client.get(f"{host}/api/v3/depth", params={"symbol": symbol, "limit": limit})
                r.raise_for_status()
                return r.json()
            except (httpx.HTTPError, ValueError) as exc:
                last = exc
    raise OrderbookError(f"Binance order book is unavailable right now ({last.__class__.__name__}). Try again shortly.")


async def get_orderbook(ref: str, depth: int = 20) -> dict:
    iid = resolve_instrument_id(ref)
    inst = await market.get_instrument(iid)
    if not inst or inst.asset_class != "crypto":
        raise OrderbookError(f"Unknown crypto instrument: {ref}", 404)
    symbol = inst.providers.get("binance")
    if not symbol:
        raise OrderbookError(f"{inst.symbol} has no Binance spot market, so no order book is available", 404)
    depth = max(1, min(int(depth), MAX_DEPTH))

    hit = _cache.get(symbol)
    if hit and time.time() - hit[0] < CACHE_S:
        book = hit[1]
    else:
        book = parse_depth(await _fetch_depth(symbol, MAX_DEPTH), MAX_DEPTH)
        book["as_of"] = time.time()
        _cache[symbol] = (book["as_of"], book)
    return {
        **book, "bids": book["bids"][:depth], "asks": book["asks"][:depth],
        "instrument_id": inst.id, "symbol": inst.symbol, "pair": symbol, "exchange": "binance",
        "source": "Binance spot public order book",
    }
