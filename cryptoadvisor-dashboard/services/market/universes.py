"""Scanner universes: which instruments the in-play scanner watches, per market.

  * crypto  — Binance USDT-M perpetuals (the contracts futures traders, e.g. on BTCC, trade)
  * stocks  — US large caps: S&P 500 members (Wikipedia, cached weekly) + big Nasdaq names outside it
  * etfs    — major equity, sector, bond and commodity ETFs
  * futures — commodity and Treasury futures
"""

import json
import logging
import re
import time
from datetime import datetime, timezone

import httpx

from services.market import catalog, registry
from services.market.models import Instrument, make_id

logger = logging.getLogger(__name__)

UNIVERSES = {
    "crypto": "Crypto (Binance USDT perpetuals)",
    "stocks": "US large caps (S&P 500 + Nasdaq leaders)",
    "etfs": "Major ETFs (equity, sector, bond, commodity)",
    "futures": "Commodity & Treasury futures",
    "fx": "Forex pairs (no volume data: candle size, body and wick rules only)",
}
DEFAULT_UNIVERSES = ("crypto",)
SP500_URL = "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies"
SP500_REFRESH_S = 7 * 86400
# Large Nasdaq-100 members that are not in the S&P 500 (foreign listings, recent IPOs)
NASDAQ_EXTRAS = ("ASML", "ARM", "PDD", "MELI", "AZN", "CCEP", "GFS", "TEAM", "MDB", "DDOG", "ZS", "SHOP", "TTD", "BIDU",
                 "JD", "NTES", "TCOM", "ON", "MRVL", "CRWD", "PANW", "ABNB", "WDAY", "DASH", "COIN", "MSTR", "PLTR", "APP")

_sp500: list[str] = []
_sp500_at = 0.0


def parse_sp500(html: str) -> list[str]:
    """Tickers from Wikipedia's S&P 500 constituents table (first column)."""
    i = html.find('id="constituents"')
    if i < 0:
        return []
    table = html[i:]
    table = table[:table.find("</table>")]
    out = []
    for row in re.findall(r"<tr[^>]*>(.*?)</tr>", table, re.S)[1:]:
        cells = re.findall(r"<td[^>]*>(.*?)</td>", row, re.S)
        if cells:
            sym = re.sub(r"<[^>]+>", "", cells[0]).strip().upper()
            if re.fullmatch(r"[A-Z]{1,5}(\.[A-Z])?", sym):
                out.append(sym)
    return out


def _cache_file():
    return registry.CACHE_DIR / "sp500.json"


def _load_sp500_cache() -> None:
    global _sp500, _sp500_at
    try:
        d = json.loads(_cache_file().read_text())
        _sp500, _sp500_at = d["symbols"], d["fetched_at"]
    except (OSError, ValueError, KeyError):
        pass


async def refresh_sp500(force: bool = False) -> int:
    global _sp500, _sp500_at
    if not _sp500:
        _load_sp500_cache()
    if _sp500 and not force and time.time() - _sp500_at < SP500_REFRESH_S:
        return len(_sp500)
    try:
        async with httpx.AsyncClient(timeout=30, follow_redirects=True,
                                     headers={"User-Agent": "Mozilla/5.0 AssetAdvisor"}) as client:
            r = await client.get(SP500_URL)
            r.raise_for_status()
        syms = parse_sp500(r.text)
        if len(syms) > 400:  # sanity check against a page layout change
            _sp500, _sp500_at = syms, time.time()
            registry.CACHE_DIR.mkdir(parents=True, exist_ok=True)
            _cache_file().write_text(json.dumps({"fetched_at": _sp500_at, "symbols": syms}))
    except (httpx.HTTPError, OSError) as exc:
        logger.warning("S&P 500 list refresh failed (%s); keeping %d cached", exc, len(_sp500))
    return len(_sp500)


def members(universe: str) -> list[Instrument]:
    """Instruments in a universe (registry must be loaded)."""
    if universe == "crypto":
        return [i for i in registry.all_instruments("crypto") if "binance_perp" in i.providers]
    if universe == "stocks":
        if not _sp500:
            _load_sp500_cache()
        syms = list(dict.fromkeys((_sp500 or sorted(catalog.POPULAR_STOCKS)) + list(NASDAQ_EXTRAS)))
        return [i for i in (registry.get(make_id("stock", s)) for s in syms) if i]
    if universe == "etfs":
        return [i for i in (registry.get(make_id("etf", s)) for s in catalog.ETF_TAGS) if i]
    if universe == "futures":
        return registry.all_instruments("commodity") + registry.all_instruments("bond")
    if universe == "fx":
        return registry.all_instruments("fx")
    return []


def universe_of(inst: Instrument) -> str | None:
    return {"crypto": "crypto", "stock": "stocks", "etf": "etfs", "commodity": "futures", "bond": "futures",
            "fx": "fx"}.get(inst.asset_class)


def market_open(universe: str, now: float | None = None) -> bool:
    """Is it worth fetching fresh candles? (Closed markets produce no new bars.)

    US equities: weekdays 13:00-21:30 UTC (covers both DST offsets, plus the closing bar).
    Futures: Sunday 22:00 UTC to Friday 22:00 UTC. Crypto: always.
    """
    if universe == "crypto":
        return True
    t = datetime.fromtimestamp(now or time.time(), timezone.utc)
    wd, minutes = t.weekday(), t.hour * 60 + t.minute
    if universe in ("stocks", "etfs"):
        return wd < 5 and 13 * 60 <= minutes <= 21 * 60 + 30
    if universe in ("futures", "fx"):  # both trade Sunday 22:00 to Friday 22:00 UTC
        if wd == 5:
            return False
        if wd == 6:
            return minutes >= 22 * 60
        if wd == 4:
            return minutes <= 22 * 60
        return True
    return False
