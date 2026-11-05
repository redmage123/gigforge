"""Instrument registry: every instrument the app knows, by canonical id, plus search.

Sources (cached as JSON under data/instruments/, refreshed daily):
  * crypto  — Binance spot USDT pairs + USDT-M perpetuals; names/ids from CoinGecko's top 500
  * stock / etf — Nasdaq Trader's public symbol directory (all US-listed securities)
  * commodity / bond / rate / index — the curated catalog
"""

import asyncio
import json
import logging
import re
import time
from pathlib import Path

import httpx

from services.market import catalog
from services.market.models import ASSET_CLASSES, Instrument, make_id, split_id
from services.user_data import DATA_DIR

logger = logging.getLogger(__name__)

CACHE_DIR = DATA_DIR / "instruments"
REFRESH_S = 24 * 3600
NASDAQ_FILES = (
    "https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt",
    "https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt",
)
BINANCE_SPOT = ("https://api.binance.com", "https://data-api.binance.vision")
BINANCE_PERP = "https://fapi.binance.com"
COINGECKO_MARKETS = "https://api.coingecko.com/api/v3/coins/markets"

STABLES = {
    "USDT", "USDC", "FDUSD", "TUSD", "BUSD", "DAI", "USDP", "USDD", "PYUSD", "USDE", "USD1", "EUR", "EURI", "AEUR",
    "GBP", "TRY", "BRL", "XUSD", "BFUSD", "WBTC", "WBETH",
}
_LEVERAGED = re.compile(r"(UP|DOWN|BULL|BEAR)$")
# Tokenized stocks/ETFs on Binance ("NVIDIA (bStocks Tokenized)") duplicate the real listings
_TOKENIZED = re.compile(r"bstocks|tokeni[sz]ed", re.I)
# Plain US tickers, optionally a share class ("BRK.B"); skips warrants, units, rights, preferreds
_US_TICKER = re.compile(r"^[A-Z]{1,5}(\.[A-B])?$")
# Warrants, rights and units share plain-looking tickers ("ABCDW"); their names give them away
_DERIVATIVE_NAME = re.compile(r"\b(warrants?|rights?|units?|subunits?)\b", re.I)
_EXCHANGES = {"N": "NYSE", "A": "NYSE American", "P": "NYSE Arca", "Z": "Cboe BZX", "V": "IEX"}
_NAME_NOISE = re.compile(
    r"\s+-\s+(Common Stock|Class [A-Z] (Common|Ordinary) (Stock|Shares)|Ordinary Shares|American Depositary Shares.*|"
    r"Common Shares.*|Units.*)$|\s+(Common Stock|Ordinary Shares)$",
    re.I,
)

_by_id: dict[str, Instrument] = {}
_cg_to_id: dict[str, str] = {}  # CoinGecko id -> instrument id (for migrating old coin_id data)
_loaded_at = 0.0
_lock = asyncio.Lock()


# ── Parsing (pure; unit-tested) ─────────────────────────────────────────────

def clean_name(name: str) -> str:
    return _NAME_NOISE.sub("", (name or "").strip()).strip(" -")


def parse_nasdaq_listed(text: str) -> list[Instrument]:
    """nasdaqlisted.txt: Symbol|Security Name|Market Category|Test Issue|Financial Status|Round Lot|ETF|NextShares"""
    out = []
    for line in text.splitlines()[1:]:
        f = line.split("|")
        if len(f) < 7 or line.startswith("File Creation Time") or f[3] != "N":
            continue
        out.extend(_us_instrument(f[0], f[1], "NASDAQ", f[6] == "Y"))
    return out


def parse_other_listed(text: str) -> list[Instrument]:
    """otherlisted.txt: ACT Symbol|Security Name|Exchange|CQS Symbol|ETF|Round Lot|Test Issue|NASDAQ Symbol"""
    out = []
    for line in text.splitlines()[1:]:
        f = line.split("|")
        if len(f) < 7 or line.startswith("File Creation Time") or f[6] != "N":
            continue
        out.extend(_us_instrument(f[0], f[1], _EXCHANGES.get(f[2], f[2]), f[4] == "Y"))
    return out


def _us_instrument(symbol: str, name: str, exchange: str, is_etf: bool) -> list[Instrument]:
    symbol = symbol.strip().upper()
    if not _US_TICKER.match(symbol) or _DERIVATIVE_NAME.search(name or ""):
        return []
    cls = "etf" if is_etf else "stock"
    tags = catalog.ETF_TAGS.get(symbol, ()) if is_etf else (("popular",) if symbol in catalog.POPULAR_STOCKS else ())
    return [Instrument(
        make_id(cls, symbol), cls, symbol, clean_name(name) or symbol,
        {"yahoo": symbol.replace(".", "-")},  # Yahoo writes share classes with a dash: BRK-B
        exchange=exchange, sessions="us_equity", tags=tags,
    )]


def build_crypto(spot_info: dict | None, perp_info: dict | None, cg_markets: list[dict],
                 us_symbols: frozenset = frozenset()) -> list[Instrument]:
    """Merge Binance spot + perpetual listings into one crypto instrument per base asset.

    `us_symbols` (US stock/ETF tickers) catches tokenized stocks CoinGecko doesn't name: "HOODB" = HOOD + B.
    """
    names: dict[str, tuple[str, str, int]] = {}  # SYMBOL -> (coingecko id, name, rank); best rank wins
    for i, c in enumerate(cg_markets or []):
        sym = str(c.get("symbol", "")).upper()
        if sym and sym not in names:
            names[sym] = (c["id"], c.get("name") or sym, i + 1)

    providers: dict[str, dict] = {}
    for s in (spot_info or {}).get("symbols", []):
        base = s.get("baseAsset", "")
        if (s.get("quoteAsset") == "USDT" and s.get("status") == "TRADING"
                and base not in STABLES and not _LEVERAGED.search(base)):
            providers.setdefault(base, {})["binance"] = s["symbol"]
    for s in (perp_info or {}).get("symbols", []):
        base = s.get("baseAsset", "")
        if (s.get("contractType") == "PERPETUAL" and s.get("quoteAsset") == "USDT" and s.get("status") == "TRADING"
                and s.get("underlyingType", "COIN") == "COIN" and base not in STABLES):
            providers.setdefault(base, {})["binance_perp"] = s["symbol"]

    out = []
    for base, prov in providers.items():
        cg_id, name, rank = names.get(base, (None, base, 10_000))
        if _TOKENIZED.search(name) or (not cg_id and base.endswith("B") and base[:-1] in us_symbols):
            continue
        if base.startswith("1000") and base[4:] in names:  # "1000PEPE" perp quotes 1,000 PEPE
            name = f"{names[base[4:]][1]} x1000"
        if cg_id:
            prov["coingecko"] = cg_id
        tags = ("popular",) if rank <= 30 else ()
        tags += ("perp",) if "binance_perp" in prov else ()
        out.append(Instrument(make_id("crypto", base), "crypto", base, name, prov, sessions="24/7",
                              price_decimals=2 if rank <= 30 else 6, tags=tags))
    return out


# ── Loading / caching ───────────────────────────────────────────────────────

def _cache_path(name: str) -> Path:
    return CACHE_DIR / f"{name}.json"


def _read_cache(name: str) -> tuple[float, list[Instrument]]:
    try:
        d = json.loads(_cache_path(name).read_text())
        return d.get("fetched_at", 0), [Instrument.from_dict(x) for x in d.get("items", [])]
    except (OSError, ValueError, KeyError):
        return 0, []


def _write_cache(name: str, items: list[Instrument]) -> None:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    tmp = _cache_path(name).with_suffix(".tmp")
    tmp.write_text(json.dumps({"fetched_at": time.time(), "items": [i.to_dict() for i in items]}))
    tmp.replace(_cache_path(name))


async def _get_json(client: httpx.AsyncClient, urls, params=None):
    last = None
    for url in ([urls] if isinstance(urls, str) else urls):
        try:
            r = await client.get(url, params=params)
            r.raise_for_status()
            return r.json()
        except (httpx.HTTPError, ValueError) as exc:
            last = exc
    raise RuntimeError(f"{urls}: {last}")


async def _fetch_crypto(client: httpx.AsyncClient, us_symbols: frozenset = frozenset()) -> list[Instrument]:
    spot = await _get_json(client, [f"{h}/api/v3/exchangeInfo" for h in BINANCE_SPOT], {"permissions": "SPOT"})
    try:
        perp = await _get_json(client, f"{BINANCE_PERP}/fapi/v1/exchangeInfo")
    except RuntimeError as exc:
        logger.warning("Binance futures listing unavailable: %s", exc)
        perp = None
    markets: list[dict] = []
    for page in (1, 2):  # top 500 by market cap: names and CoinGecko ids
        try:
            markets += await _get_json(client, COINGECKO_MARKETS, {"vs_currency": "usd", "order": "market_cap_desc",
                                                                   "per_page": 250, "page": page})
        except RuntimeError as exc:
            logger.warning("CoinGecko names unavailable: %s", exc)
            break
    if not markets:  # keep yesterday's names rather than losing them
        _, old = _read_cache("crypto")
        markets = [{"symbol": i.symbol, "id": i.providers.get("coingecko"), "name": i.name}
                   for i in old if i.providers.get("coingecko")]
    return build_crypto(spot, perp, markets, us_symbols)


async def _fetch_us_listed(client: httpx.AsyncClient) -> list[Instrument]:
    texts = []
    for url in NASDAQ_FILES:
        r = await client.get(url)
        r.raise_for_status()
        texts.append(r.text)
    return parse_nasdaq_listed(texts[0]) + parse_other_listed(texts[1])


def _index(groups: list[list[Instrument]]) -> None:
    global _by_id, _cg_to_id
    by_id: dict[str, Instrument] = {}
    for group in groups:
        for inst in group:
            by_id.setdefault(inst.id, inst)
    _by_id = by_id
    _cg_to_id = {i.providers["coingecko"]: i.id for i in by_id.values() if i.providers.get("coingecko")}


async def refresh(force: bool = False) -> dict:
    """Reload listings older than a day (or all with force). Network failures keep the cached copy."""
    global _loaded_at
    async with _lock:
        counts = {}
        groups = [catalog.curated()]
        us_symbols: frozenset = frozenset()
        async with httpx.AsyncClient(timeout=30, headers={"User-Agent": "Mozilla/5.0 AssetAdvisor"}) as client:
            # US listings first: the crypto build uses them to spot tokenized stocks
            for name, fetch in (("us_listed", _fetch_us_listed), ("crypto", _fetch_crypto)):
                fetched_at, items = _read_cache(name)
                if force or not items or time.time() - fetched_at > REFRESH_S:
                    try:
                        items = await (fetch(client, us_symbols) if name == "crypto" else fetch(client))
                        _write_cache(name, items)
                    except Exception as exc:  # noqa: BLE001 — a listing outage must not break the app
                        logger.warning("instrument refresh %s failed (%s); using cache of %d", name, exc, len(items))
                groups.append(items)
                counts[name] = len(items)
                if name == "us_listed":
                    us_symbols = frozenset(i.symbol for i in items)
        _index(groups)
        _loaded_at = time.time()
        counts["total"] = len(_by_id)
        return counts


async def ensure_loaded() -> None:
    if _by_id and time.time() - _loaded_at < REFRESH_S:
        return
    if not _by_id:  # first use: serve from cache files immediately if they exist
        cached = [catalog.curated()] + [_read_cache(n)[1] for n in ("crypto", "us_listed")]
        if all(cached[1:]):
            _index(cached)
            asyncio.get_running_loop().create_task(refresh())  # freshen in the background if stale
            return
    await refresh()


def load_for_tests(instruments: list[Instrument]) -> None:
    global _loaded_at
    _index([catalog.curated(), instruments])
    _loaded_at = time.time()


# ── Lookup & search ─────────────────────────────────────────────────────────

def get(instrument_id: str) -> Instrument | None:
    try:
        cls, sym = split_id(instrument_id)
    except ValueError:
        return None
    return _by_id.get(make_id(cls, sym))


def all_instruments(asset_class: str | None = None) -> list[Instrument]:
    return [i for i in _by_id.values() if asset_class is None or i.asset_class == asset_class]


def from_coingecko_id(coin_id: str) -> str | None:
    """Old data stored CoinGecko ids ("bitcoin"); map them to "crypto:BTC"."""
    from services.coin_ids import SYMBOL_TO_ID  # legacy table, used as a fallback

    if coin_id in _cg_to_id:
        return _cg_to_id[coin_id]
    for sym, cid in SYMBOL_TO_ID.items():
        if cid == coin_id:
            return make_id("crypto", sym)
    return None


def search(query: str, asset_classes: list[str] | None = None, limit: int = 20, tradable_only: bool = False) -> list[Instrument]:
    q = (query or "").strip().upper()
    classes = [c for c in (asset_classes or []) if c in ASSET_CLASSES] or None
    if not q:
        return []
    scored = []
    for inst in _by_id.values():
        if classes and inst.asset_class not in classes:
            continue
        if tradable_only and not inst.tradable:
            continue
        sym, name = inst.symbol.upper(), inst.name.upper()
        if sym == q or inst.id.upper() == q or name == q:
            score = 0
        elif sym.startswith(q):
            score = 2
        elif name.startswith(q):
            score = 3
        elif q in name or (len(q) >= 3 and q in sym):
            score = 5
        else:
            continue
        if "popular" in inst.tags or inst.asset_class in ("commodity", "bond", "rate", "index"):
            score -= 1  # well-known and curated instruments first
        scored.append((score, len(sym), sym, inst))
    scored.sort(key=lambda t: t[:3])
    return [t[3] for t in scored[:limit]]
