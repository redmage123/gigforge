"""Dashboard market stats (/api/market/prices and /api/market/global) that survive upstream outages.

CoinGecko's free API rate-limits this server often, so:
  * Coin prices, 24h change and 24h volume come from the market layer (Binance via `services.market`).
    CoinGecko only supplies what nobody else has keylessly: logos, names and circulating supply
    (market cap = supply x live price). That metadata changes slowly and is refreshed every 30 minutes;
    while CoinGecko is down, supply comes from CoinLore's keyless tickers (no logos there).
  * Global stats try CoinGecko, then CoinPaprika, then CoinLore (both keyless), mapped to CoinGecko's
    /global shape. Dominance missing from a fallback is filled from the coins we price ourselves.
  * Every payload is cached with a minimum refresh interval and single-flight refresh, persisted to the
    store (SHARED records) so a restart doesn't start empty, and served stale (marked) when every
    upstream fails. Only a cold cache with every upstream down raises MarketDataUnavailable.
"""

import asyncio
import copy
import logging
import re
import time

import httpx

from services import coingecko, store
from services import market
from services.market import registry

logger = logging.getLogger(__name__)

GLOBAL_MIN_REFRESH_S = 300      # never ask upstream for global stats more often than this
PRICES_MIN_REFRESH_S = 120      # nor for a coin's price
META_REFRESH_S = 1800           # CoinGecko logos / supply for coins Binance prices
COLD_RETRY_S = 30               # with nothing cached, a failed refresh is retried after this
MAX_COINS = 500                 # bound on cached coins (ids come from user URLs)

GLOBAL_KEY = "market_stats_global"
PRICES_KEY = "market_stats_prices"

COINPAPRIKA_GLOBAL = "https://api.coinpaprika.com/v1/global"
COINLORE_GLOBAL = "https://api.coinlore.net/api/global/"
COINLORE_TICKERS = "https://api.coinlore.net/api/tickers/?start=0&limit=100"
_UA = {"User-Agent": "AssetAdvisor/1.0"}
_COIN_ID = re.compile(r"^[a-z0-9][a-z0-9-]{0,79}$")


class MarketDataUnavailable(Exception):
    """No cached data and every upstream failed. The message is safe to show to users."""


# ── State ───────────────────────────────────────────────────────────────────

class _State:
    def __init__(self):
        self.loaded = False
        self.global_payload: dict | None = None    # CoinGecko /global shape (+ source)
        self.global_fetched_at = 0.0
        self.global_attempted_at = 0.0
        self.global_error = ""
        self.coins: dict[str, dict] = {}           # coin id -> entry (see _entry)
        self.refreshed_at: dict[str, float] = {}   # coin id -> last successful price refresh
        self.meta_at: dict[str, float] = {}        # coin id -> last CoinGecko metadata refresh
        self.attempted_at: dict[str, float] = {}   # coin id -> last refresh attempt
        self.prices_error = ""
        self.coinlore_at = 0.0                     # last CoinLore tickers attempt (CoinGecko fallback)
        self._locks: dict[str, asyncio.Lock] = {}
        self._loop = None

    def lock(self, name: str) -> asyncio.Lock:
        # asyncio locks belong to one event loop; tests run each request in a fresh loop
        loop = asyncio.get_running_loop()
        if loop is not self._loop:
            self._loop, self._locks = loop, {}
        return self._locks.setdefault(name, asyncio.Lock())


_state = _State()


def _reset_for_tests() -> None:
    global _state
    _state = _State()


async def _load() -> None:
    """Restore the last good payloads from the store once per process."""
    if _state.loaded:
        return
    async with _state.lock("load"):
        if _state.loaded:
            return
        try:
            g = await asyncio.to_thread(store.get, store.SHARED, GLOBAL_KEY)
            p = await asyncio.to_thread(store.get, store.SHARED, PRICES_KEY)
        except Exception as exc:  # noqa: BLE001 — a store outage must not break market data
            logger.warning("market_stats: store read failed: %s", exc)
            g = p = None
        if isinstance(g, dict) and isinstance(g.get("payload"), dict) and _state.global_payload is None:
            _state.global_payload = g["payload"]
            _state.global_fetched_at = float(g.get("fetched_at") or 0)
        if isinstance(p, dict) and isinstance(p.get("coins"), dict) and not _state.coins:
            _state.coins = p["coins"]
            _state.refreshed_at = {k: float(v) for k, v in (p.get("refreshed_at") or {}).items()}
            _state.meta_at = {k: float(v) for k, v in (p.get("meta_at") or {}).items()}
        _state.loaded = True


async def _persist(key: str, data: dict) -> None:
    try:
        await asyncio.to_thread(store.put, store.SHARED, key, data)
    except Exception as exc:  # noqa: BLE001
        logger.warning("market_stats: store write failed (%s): %s", key, exc)


def _describe(exc: Exception) -> str:
    if isinstance(exc, httpx.HTTPStatusError):
        code = exc.response.status_code
        return "rate limited (429)" if code == 429 else f"HTTP {code}"
    if isinstance(exc, httpx.TimeoutException):
        return "timed out"
    if isinstance(exc, httpx.RequestError):
        return "unreachable"
    return exc.__class__.__name__


# ── Prices ──────────────────────────────────────────────────────────────────

def _num(v):
    try:
        return None if v is None else float(v)
    except (TypeError, ValueError):
        return None


def _entry(coin_id: str, old: dict | None, quote, meta: dict | None, now: float) -> dict | None:
    """One coin in CoinGecko /simple/price shape (usd, usd_24h_change, …) plus /coins/markets-style
    extras (symbol, image, current_price, …) so list-style callers can use it too."""
    old = old or {}
    meta = meta or {}
    if quote is not None:
        price, change, volume = quote.price, quote.change_pct, quote.volume
        source, as_of, stale = "binance", quote.as_of, bool(quote.stale)
    elif meta.get("current_price") is not None:
        price, change, volume = (_num(meta.get("current_price")), _num(meta.get("price_change_percentage_24h")),
                                 _num(meta.get("total_volume")))
        source, as_of, stale = meta.get("_source", "coingecko"), now, False
    else:
        return None
    supply = _num(meta.get("circulating_supply")) or _num(old.get("circulating_supply"))
    mcap = price * supply if (price and supply) else (_num(meta.get("market_cap")) if quote is None else None)
    if mcap is None and old.get("usd_market_cap") and old.get("usd") and price:
        mcap = old["usd_market_cap"] * price / old["usd"]  # scale the last known cap to the new price
    # Without CoinGecko metadata the ticker comes from the instrument id ("crypto:BTC" -> "btc")
    q_sym = quote.instrument_id.partition(":")[2] if quote is not None else ""
    inst = registry.get(quote.instrument_id) if quote is not None else None
    symbol = (meta.get("symbol") or old.get("symbol") or q_sym).lower()
    return {
        "usd": price, "usd_market_cap": mcap, "usd_24h_vol": volume, "usd_24h_change": change,
        "last_updated_at": int(as_of),
        "id": coin_id, "symbol": symbol, "name": meta.get("name") or old.get("name") or (inst.name if inst else coin_id),
        "image": meta.get("image") or old.get("image"),
        "current_price": price, "price_change_percentage_24h": change, "market_cap": mcap,
        "total_volume": volume, "circulating_supply": supply,
        "source": source, "stale": stale,
    }


async def _binance_quotes(coin_ids: list[str]) -> tuple[dict, str]:
    """coin id -> Quote from the market layer, plus an error description if it failed outright."""
    try:
        await registry.ensure_loaded()
        iids = {cid: registry.from_coingecko_id(cid) for cid in coin_ids}
        iids = {cid: iid for cid, iid in iids.items() if iid}
        got = await market.quotes(list(iids.values())) if iids else {}
        return {cid: got[iid] for cid, iid in iids.items() if iid in got}, ""
    except Exception as exc:  # noqa: BLE001
        logger.warning("market_stats: market-layer quotes failed: %s", exc)
        return {}, f"Binance: {_describe(exc)}"


async def _refresh_prices(coin_ids: list[str], now: float) -> None:
    quotes, q_err = await _binance_quotes(coin_ids)
    # CoinGecko for coins Binance doesn't price (every refresh) and for stale logos/supply (rarely)
    need_meta = [c for c in coin_ids if c not in quotes or now - _state.meta_at.get(c, 0) >= META_REFRESH_S]
    metas: dict[str, dict] = {}
    cg_err = ""
    if need_meta:
        try:
            rows = await coingecko.fetch_markets(tuple(need_meta))
            metas = {r["id"]: r for r in rows or [] if isinstance(r, dict) and r.get("id")}
            for c in need_meta:
                _state.meta_at[c] = now
        except Exception as exc:  # noqa: BLE001
            cg_err = f"CoinGecko: {_describe(exc)}"
            logger.info("market_stats: CoinGecko markets failed: %s", exc)
    if cg_err:
        await _coinlore_meta(coin_ids, quotes, metas, now)
    changed = False
    for c in coin_ids:
        _state.attempted_at[c] = now
        e = _entry(c, _state.coins.get(c), quotes.get(c), metas.get(c), now)
        if e is not None:
            _state.coins[c] = e
            _state.refreshed_at[c] = now
            changed = True
        elif c in _state.coins:
            _state.coins[c]["stale"] = True
    _state.prices_error = "; ".join(x for x in (q_err, cg_err) if x)
    _trim()
    if changed:
        await _persist(PRICES_KEY, {"coins": _state.coins, "refreshed_at": _state.refreshed_at,
                                    "meta_at": _state.meta_at})


async def _coinlore_meta(coin_ids: list[str], quotes: dict, metas: dict, now: float) -> None:
    """CoinGecko is down: take circulating supply (for market caps) and prices of coins Binance lacks
    from CoinLore's keyless top-100 tickers. No logos there; cached ones are kept. Asked at most every
    META_REFRESH_S, success or not."""
    want = [c for c in coin_ids if c not in metas
            and (c not in quotes or not (_state.coins.get(c) or {}).get("circulating_supply"))]
    if not want or now - _state.coinlore_at < META_REFRESH_S:
        return
    _state.coinlore_at = now
    try:
        rows = (await _get_json(COINLORE_TICKERS)).get("data") or []
    except Exception as exc:  # noqa: BLE001
        logger.info("market_stats: CoinLore tickers failed: %s", exc)
        return
    by_id = {str(r.get("nameid")): r for r in rows if isinstance(r, dict)}
    by_sym = {str(r.get("symbol", "")).upper(): r for r in reversed(rows) if isinstance(r, dict)}  # best rank wins
    for c in want:
        q = quotes.get(c)
        r = by_id.get(c) or (by_sym.get(q.instrument_id.partition(":")[2]) if q is not None else None)
        if r:
            metas[c] = {"_source": "coinlore", "symbol": r.get("symbol"), "name": r.get("name"),
                        "circulating_supply": _num(r.get("csupply")), "current_price": _num(r.get("price_usd")),
                        "price_change_percentage_24h": _num(r.get("percent_change_24h")),
                        "total_volume": _num(r.get("volume24")), "market_cap": _num(r.get("market_cap_usd"))}


def _trim() -> None:
    if len(_state.coins) <= MAX_COINS:
        return
    for c in sorted(_state.coins, key=lambda k: _state.refreshed_at.get(k, 0))[:len(_state.coins) - MAX_COINS]:
        for d in (_state.coins, _state.refreshed_at, _state.meta_at, _state.attempted_at):
            d.pop(c, None)


def _due(c: str, now: float) -> bool:
    if c in _state.coins:
        last = max(_state.refreshed_at.get(c, 0), _state.attempted_at.get(c, 0))
        return now - last >= PRICES_MIN_REFRESH_S
    return now - _state.attempted_at.get(c, 0) >= COLD_RETRY_S


def _prices_out(coin_ids: list[str], now: float) -> dict:
    out = {}
    for c in coin_ids:
        e = _state.coins.get(c)
        if e is None:
            continue
        e = dict(e)
        # Older than two refresh intervals means refreshes have been failing
        if now - _state.refreshed_at.get(c, 0) > 2 * PRICES_MIN_REFRESH_S + 5:
            e["stale"] = True
        out[c] = e
    return out


async def get_prices(coin_ids) -> dict:
    """{coin_id: {usd, usd_24h_change, usd_24h_vol, usd_market_cap, last_updated_at, symbol, image, …}}.

    Unknown coins are absent (as with CoinGecko). Raises MarketDataUnavailable only when none of the
    requested coins has data and the upstreams failed.
    """
    ids = list(dict.fromkeys(str(c).strip().lower() for c in coin_ids))
    ids = [c for c in ids if _COIN_ID.match(c)]
    await _load()
    now = time.time()
    if any(_due(c, now) for c in ids):
        async with _state.lock("prices"):  # single flight: waiters reuse the refresh that just ran
            now = time.time()
            due = [c for c in ids if _due(c, now)]
            if due:
                await _refresh_prices(due, now)
    out = _prices_out(ids, time.time())
    if not out and ids and _state.prices_error:
        raise MarketDataUnavailable(
            f"Market prices are temporarily unavailable ({_state.prices_error}). Please try again in a minute.")
    return out


# ── Global stats ────────────────────────────────────────────────────────────

async def _get_json(url: str):
    async with httpx.AsyncClient(timeout=10.0, headers=_UA) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        return resp.json()


def _cg_global(raw: dict) -> dict:
    d = raw.get("data") if isinstance(raw, dict) else None
    if not isinstance(d, dict) or not (d.get("total_market_cap") or {}).get("usd"):
        raise ValueError("unexpected CoinGecko /global payload")
    return {"data": d}


def _paprika_global(raw: dict) -> dict:
    mcap = _num(raw.get("market_cap_usd"))
    if not mcap:
        raise ValueError("unexpected CoinPaprika /global payload")
    dom = {}
    if _num(raw.get("bitcoin_dominance_percentage")) is not None:
        dom["btc"] = _num(raw["bitcoin_dominance_percentage"])
    return {"data": {
        "active_cryptocurrencies": raw.get("cryptocurrencies_number"),
        "total_market_cap": {"usd": mcap},
        "total_volume": {"usd": _num(raw.get("volume_24h_usd"))},
        "market_cap_percentage": dom,
        "market_cap_change_percentage_24h_usd": _num(raw.get("market_cap_change_24h")),
        "updated_at": raw.get("last_updated"),
    }}


def _coinlore_global(raw) -> dict:
    row = raw[0] if isinstance(raw, list) and raw else None
    if not isinstance(row, dict) or not _num(row.get("total_mcap")):
        raise ValueError("unexpected CoinLore /global payload")
    dom = {k: _num(row.get(f"{k}_d")) for k in ("btc", "eth")}
    return {"data": {
        "active_cryptocurrencies": row.get("coins_count"),
        "total_market_cap": {"usd": _num(row["total_mcap"])},
        "total_volume": {"usd": _num(row.get("total_volume"))},
        "market_cap_percentage": {k: v for k, v in dom.items() if v is not None},
        "market_cap_change_percentage_24h_usd": _num(row.get("mcap_change")),
        "updated_at": int(time.time()),
    }}


async def _from_coingecko() -> dict:
    return _cg_global(await coingecko.fetch_global())


async def _from_coinpaprika() -> dict:
    return _paprika_global(await _get_json(COINPAPRIKA_GLOBAL))


async def _from_coinlore() -> dict:
    return _coinlore_global(await _get_json(COINLORE_GLOBAL))


# Tried in order; the first that answers wins
GLOBAL_PROVIDERS = [("coingecko", _from_coingecko), ("coinpaprika", _from_coinpaprika), ("coinlore", _from_coinlore)]


async def _fill_dominance(payload: dict) -> None:
    """Fallback providers give BTC (and maybe ETH) dominance only: add the coins we price ourselves."""
    d = payload["data"]
    total = (d.get("total_market_cap") or {}).get("usd")
    if not total:
        return
    try:
        from config import DEFAULT_COINS
        coins = await get_prices(DEFAULT_COINS)
    except Exception:  # noqa: BLE001 — dominance is a nice-to-have
        coins = {}
    dom = dict(d.get("market_cap_percentage") or {})
    for e in coins.values():
        sym, cap = e.get("symbol"), e.get("usd_market_cap")
        if sym and cap and sym not in dom:
            dom[sym] = cap / total * 100
    d["market_cap_percentage"] = dict(sorted(dom.items(), key=lambda kv: kv[1] or 0, reverse=True))


async def _refresh_global(now: float) -> None:
    # attempted_at is set only once the refresh is over, so concurrent callers queue on the lock and
    # reuse its result instead of skipping it with nothing to serve
    errors = []
    for name, fetch in GLOBAL_PROVIDERS:
        try:
            payload = await fetch()
        except Exception as exc:  # noqa: BLE001
            errors.append(f"{name}: {_describe(exc)}")
            logger.info("market_stats: %s global failed: %s", name, exc)
            continue
        if name != "coingecko":
            await _fill_dominance(payload)
        payload["source"] = name
        _state.global_payload, _state.global_fetched_at, _state.global_error = payload, now, ""
        _state.global_attempted_at = now
        await _persist(GLOBAL_KEY, {"payload": payload, "fetched_at": now})
        return
    _state.global_error = "; ".join(errors)
    _state.global_attempted_at = now


async def get_global() -> dict:
    """CoinGecko /global shape ({"data": {...}}) plus top-level source, stale and fetched_at."""
    await _load()
    now = time.time()
    last = max(_state.global_fetched_at, _state.global_attempted_at)
    interval = GLOBAL_MIN_REFRESH_S if _state.global_payload else COLD_RETRY_S
    if now - last >= interval:
        async with _state.lock("global"):
            now = time.time()
            last = max(_state.global_fetched_at, _state.global_attempted_at)
            if now - last >= interval:
                await _refresh_global(now)
    if _state.global_payload is None:
        raise MarketDataUnavailable(
            f"Global market stats are temporarily unavailable ({_state.global_error or 'no provider answered'})."
            " Please try again in a minute.")
    out = copy.deepcopy(_state.global_payload)
    out["fetched_at"] = int(_state.global_fetched_at)
    # Stale: the latest refresh failed, or it is old (e.g. restored from the store after a restart)
    out["stale"] = bool(_state.global_error) or time.time() - _state.global_fetched_at > 2 * GLOBAL_MIN_REFRESH_S + 5
    return out
