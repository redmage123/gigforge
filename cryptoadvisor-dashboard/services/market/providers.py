"""Market data providers: Binance (spot + USDT-M perpetuals) for crypto, Yahoo Finance for everything else.

Each provider turns its own API into Quote and Candle objects. Caching, concurrency limits and
stale fallback live here so features never call these APIs directly.
"""

import asyncio
import logging
import math
import time
from collections import defaultdict

import httpx

from services.market.models import Candle, Instrument, Quote

logger = logging.getLogger(__name__)

# timeframe -> (Binance interval, candles merged per bar, bar seconds); 3h/9d are built, not native
TIMEFRAMES: dict[str, tuple[str, int, int]] = {
    "1h": ("1h", 1, 3600), "2h": ("2h", 1, 7200), "3h": ("1h", 3, 10800), "6h": ("6h", 1, 21600),
    "12h": ("12h", 1, 43200), "1d": ("1d", 1, 86400), "3d": ("3d", 1, 259200), "9d": ("3d", 3, 777600),
}
MAX_KLINES = 1000
_UA = {"User-Agent": "Mozilla/5.0 AssetAdvisor"}


# ── Candle building ─────────────────────────────────────────────────────────

def merge(group: list[Candle]) -> Candle:
    return Candle(group[0].open_time, group[0].open, max(c.high for c in group), min(c.low for c in group),
                  group[-1].close, sum(c.quote_volume for c in group))


def aggregate_epoch(candles: list[Candle], factor: int, bar_seconds: int) -> list[Candle]:
    """24/7 markets: merge candles into epoch-aligned buckets (3h from 1h, 9d from 3d).

    Incomplete buckets are dropped, except the last one, which is the forming bar.
    """
    if factor == 1:
        return candles
    bucket_ms = bar_seconds * 1000
    groups: dict[int, list[Candle]] = defaultdict(list)
    for c in candles:
        groups[c.open_time // bucket_ms].append(c)
    keys = sorted(groups)
    return [merge(groups[k]) for i, k in enumerate(keys) if len(groups[k]) >= factor or i == len(keys) - 1]


def aggregate_sessions(candles: list[Candle], factor: int, base_seconds: int) -> list[Candle]:
    """Session markets (stocks, futures): merge `factor` consecutive candles within each trading session.

    A session is a run of candles with no gap longer than one base candle. A short remainder at the
    end of a session (less than half a bar) joins the previous bar instead of standing alone.
    """
    if factor == 1 or not candles:
        return candles
    runs, run = [], [candles[0]]
    for prev, c in zip(candles, candles[1:]):
        if c.open_time - prev.open_time > base_seconds * 1000 * 1.5:
            runs.append(run)
            run = []
        run.append(c)
    runs.append(run)
    out = []
    for r in runs:
        chunks = [r[i:i + factor] for i in range(0, len(r), factor)]
        if len(chunks) > 1 and len(chunks[-1]) * 2 < factor:
            tail = chunks.pop()
            chunks[-1] = chunks[-1] + tail
        out.extend(merge(ch) for ch in chunks)
    return out


# ── Binance ─────────────────────────────────────────────────────────────────

class BinanceProvider:
    """Spot (api.binance.com) or USDT-M perpetual futures (fapi.binance.com)."""

    def __init__(self, perp: bool):
        self.perp = perp
        self.name = "binance_perp" if perp else "binance"
        self.hosts = ("https://fapi.binance.com",) if perp else ("https://api.binance.com", "https://data-api.binance.vision")
        self.prefix = "/fapi/v1" if perp else "/api/v3"
        self._tickers: dict[str, dict] = {}
        self._tickers_at = 0.0
        self._lock = asyncio.Lock()

    async def _get(self, client: httpx.AsyncClient, path: str, params: dict | None = None):
        last = None
        for host in self.hosts:
            try:
                r = await client.get(f"{host}{self.prefix}{path}", params=params)
                r.raise_for_status()
                return r.json()
            except (httpx.HTTPError, ValueError) as exc:
                last = exc
        raise RuntimeError(f"{self.name} {path}: {last}")

    async def _all_tickers(self) -> tuple[dict[str, dict], bool]:
        """Every symbol's 24h ticker in one call, cached 30 s; stale copy if Binance is down."""
        async with self._lock:
            if time.time() - self._tickers_at < 30 and self._tickers:
                return self._tickers, False
            try:
                async with httpx.AsyncClient(timeout=15, headers=_UA) as client:
                    rows = await self._get(client, "/ticker/24hr")
                self._tickers = {r["symbol"]: r for r in rows}
                self._tickers_at = time.time()
                return self._tickers, False
            except RuntimeError as exc:
                logger.warning("%s tickers failed: %s", self.name, exc)
                return self._tickers, True

    async def quotes(self, instruments: list[Instrument]) -> dict[str, Quote]:
        tickers, stale = await self._all_tickers()
        out = {}
        for inst in instruments:
            t = tickers.get(inst.providers.get(self.name, ""))
            if not t:
                continue
            out[inst.id] = Quote(inst.id, float(t["lastPrice"]), float(t["priceChangePercent"]),
                                 float(t["quoteVolume"]), int(t["closeTime"]) / 1000, self.name, stale=stale)
        return out

    async def candles(self, inst: Instrument, timeframe: str, bars: int, client: httpx.AsyncClient | None = None) -> list[Candle]:
        interval, factor, bar_s = TIMEFRAMES[timeframe]
        params = {"symbol": inst.providers[self.name], "interval": interval, "limit": min(MAX_KLINES, bars * factor)}
        if client is None:
            async with httpx.AsyncClient(timeout=20, headers=_UA) as c:
                rows = await self._get(c, "/klines", params)
        else:
            rows = await self._get(client, "/klines", params)
        return aggregate_epoch([Candle.from_kline(k) for k in rows], factor, bar_s)


# ── Yahoo Finance ───────────────────────────────────────────────────────────

# timeframe -> (Yahoo interval, candles merged per bar)
YAHOO_TIMEFRAMES: dict[str, tuple[str, int]] = {
    "1h": ("60m", 1), "2h": ("60m", 2), "3h": ("60m", 3), "6h": ("60m", 6), "12h": ("60m", 12),
    "1d": ("1d", 1), "3d": ("1d", 3), "9d": ("1d", 9),
}
YAHOO_MAX_INTRADAY_DAYS = 729  # Yahoo serves hourly history for about two years
_TRADING_HOURS = {"us_equity": 6.5, "futures": 23.0, "fx": 24.0, "index": 6.5, "24/7": 24.0}


def parse_yahoo_chart(payload: dict, multiplier: float = 1.0) -> tuple[dict, list[Candle]]:
    """(meta, candles) from a v8 chart response. Rows with missing prices (halts, gaps) are skipped."""
    res = (payload.get("chart") or {}).get("result") or []
    if not res:
        err = (payload.get("chart") or {}).get("error") or {}
        raise RuntimeError(f"yahoo: {err.get('description') or 'no data'}")
    r = res[0]
    meta = r.get("meta", {})
    q = ((r.get("indicators") or {}).get("quote") or [{}])[0]
    series = [q.get(k) or [] for k in ("open", "high", "low", "close", "volume")]
    candles = []
    for i, ts in enumerate(r.get("timestamp") or []):
        o, h, l, c, v = (s[i] if i < len(s) else None for s in series)
        if None in (o, h, l, c):
            continue
        v = v or 0
        # Volume is shares (stocks) or contracts (futures): turn it into USD notional
        candles.append(Candle(int(ts) * 1000, float(o), float(h), float(l), float(c), float(v) * float(c) * multiplier))
    return meta, candles


class YahooProvider:
    name = "yahoo"
    BASE = "https://query1.finance.yahoo.com/v8/finance/chart/"

    def __init__(self, concurrency: int = 6, quote_ttl: float = 60):
        self._sem = asyncio.Semaphore(concurrency)
        self._quote_ttl = quote_ttl
        self._quotes: dict[str, tuple[float, Quote]] = {}

    async def _chart(self, client: httpx.AsyncClient, symbol: str, params: dict) -> dict:
        async with self._sem:
            r = await client.get(self.BASE + symbol, params=params)
            if r.status_code == 404:
                raise RuntimeError(f"yahoo: unknown symbol {symbol}")
            r.raise_for_status()
            return r.json()

    async def _quote(self, client: httpx.AsyncClient, inst: Instrument) -> Quote | None:
        cached = self._quotes.get(inst.id)
        if cached and time.time() - cached[0] < self._quote_ttl:
            return cached[1]
        try:
            meta, _ = parse_yahoo_chart(await self._chart(client, inst.providers["yahoo"], {"range": "1d", "interval": "1d"}))
            price, prev = meta.get("regularMarketPrice"), meta.get("chartPreviousClose") or meta.get("previousClose")
            if price is None:
                raise RuntimeError("no price")
            vol = meta.get("regularMarketVolume")
            q = Quote(inst.id, float(price), (price / prev - 1) * 100 if prev else None,
                      float(vol) * float(price) * inst.multiplier if vol and inst.has_volume else None,
                      float(meta.get("regularMarketTime") or time.time()), self.name, delayed=True)
            self._quotes[inst.id] = (time.time(), q)
            return q
        except (httpx.HTTPError, RuntimeError, ValueError, KeyError) as exc:
            logger.debug("yahoo quote %s failed: %s", inst.id, exc)
            if cached:  # stale beats nothing
                return Quote(**{**cached[1].__dict__, "stale": True})
            return None

    async def quotes(self, instruments: list[Instrument]) -> dict[str, Quote]:
        async with httpx.AsyncClient(timeout=15, headers=_UA) as client:
            got = await asyncio.gather(*(self._quote(client, i) for i in instruments))
        return {q.instrument_id: q for q in got if q}

    async def candles(self, inst: Instrument, timeframe: str, bars: int, client: httpx.AsyncClient | None = None) -> list[Candle]:
        interval, factor = YAHOO_TIMEFRAMES[timeframe]
        need = bars * factor
        if interval == "60m":
            per_day = _TRADING_HOURS.get(inst.sessions, 6.5)
            days = min(YAHOO_MAX_INTRADAY_DAYS, math.ceil(need / per_day * 7 / 5) + 4)
        else:
            days = math.ceil(need * (7 / 5 if inst.sessions != "24/7" else 1)) + 7
        now = int(time.time())
        params = {"interval": interval, "period1": now - days * 86400, "period2": now, "includePrePost": "false"}
        if client is None:
            async with httpx.AsyncClient(timeout=20, headers=_UA) as c:
                payload = await self._chart(c, inst.providers["yahoo"], params)
        else:
            payload = await self._chart(client, inst.providers["yahoo"], params)
        _, base = parse_yahoo_chart(payload, inst.multiplier)
        base_s = 3600 if interval == "60m" else 86400
        merged = aggregate_sessions(base, factor, base_s) if inst.sessions != "24/7" else aggregate_epoch(base, factor, base_s * factor)
        return merged[-bars:]


BINANCE_SPOT = BinanceProvider(perp=False)
BINANCE_PERP = BinanceProvider(perp=True)
YAHOO = YahooProvider()
