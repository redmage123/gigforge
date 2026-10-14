"""In-play scanner — flags coins with a volume spike plus an outsized, decisive daily candle.

Every 15 minutes the scanner measures the forming (today) and last closed daily candle of
every Binance spot USDT pair against the previous LOOKBACK_DAYS candles:

  * volume_ratio  — candle quote volume / average quote volume
  * range_ratio   — candle range (high - low) / average range
  * opposing wick — bullish: upper wick, bearish: lower wick, as % of the range
  * body          — |close - open| as % of the range

Anything above the loose BASE_* floors is stored as a *candidate* (30 days). Each user has
their own Rules (defaults: volume > 4x, range > 3x, wick <= 25%, body >= 50%); a candidate
that satisfies a user's rules enters that user's in-play list (newest first, max 25 coins,
30 days) and is pushed to their phone. Changing rules re-evaluates the stored candidates
immediately, so tuning shows its effect on the last 30 days right away (without re-pushing).
"""

import asyncio
import logging
import re
import time
from dataclasses import asdict, dataclass, fields
from typing import Literal

import httpx

from services import in_play_news, in_play_push
from services.user_data import DATA_DIR, load_shared_data, load_user_data, save_shared_data, save_user_data

logger = logging.getLogger(__name__)

LOOKBACK_DAYS = 60
MIN_HISTORY_DAYS = 30
RETENTION_DAYS = 30
MAX_ENTRIES = 25
# Candidate floors — user rules cannot go below these
BASE_VOLUME_MULT = 2.0
BASE_RANGE_MULT = 2.0
# Forming candles keep changing; refresh their news at most this often
CATALYST_REFRESH_S = 3 * 3600

BINANCE_HOSTS = ("https://api.binance.com", "https://data-api.binance.vision")
CANDIDATES_NAME = "in_play_candidates"
STATE_NAME = "in_play_state"
RULES_NAMESPACE = "in_play_rules"

# Stablecoins / fiat proxies whose USDT pairs never represent a real "move"
_EXCLUDED_BASES = {
    "USDC", "FDUSD", "TUSD", "BUSD", "DAI", "USDP", "USDD", "PYUSD", "USDE", "USD1",
    "EUR", "EURI", "AEUR", "GBP", "TRY", "BRL", "XUSD", "BFUSD", "PAXG", "WBTC", "WBETH",
}
_LEVERAGED = re.compile(r"(UP|DOWN|BULL|BEAR)$")

Direction = Literal["bullish", "bearish"]


@dataclass(frozen=True)
class Candle:
    open_time: int  # ms
    open: float
    high: float
    low: float
    close: float
    quote_volume: float

    @classmethod
    def from_kline(cls, k: list) -> "Candle":
        return cls(int(k[0]), float(k[1]), float(k[2]), float(k[3]), float(k[4]), float(k[7]))

    @property
    def range(self) -> float:
        return self.high - self.low


@dataclass(frozen=True)
class Metrics:
    direction: Direction
    volume_ratio: float
    range_ratio: float
    opposing_wick_pct: float  # 0-100
    body_pct: float  # 0-100
    change_pct: float


@dataclass(frozen=True)
class Rules:
    volume_mult: float = 4.0
    range_mult: float = 3.0
    max_wick_pct: float = 25.0
    min_body_pct: float = 50.0

    @classmethod
    def from_dict(cls, d: dict | None) -> "Rules":
        known = {f.name for f in fields(cls)}
        return cls(**{k: float(v) for k, v in (d or {}).items() if k in known})

    def validate(self) -> str | None:
        if self.volume_mult < BASE_VOLUME_MULT or self.volume_mult > 100:
            return f"Volume multiple must be between {BASE_VOLUME_MULT:g} and 100"
        if self.range_mult < BASE_RANGE_MULT or self.range_mult > 100:
            return f"Candle multiple must be between {BASE_RANGE_MULT:g} and 100"
        if not 0 <= self.max_wick_pct <= 100 or not 0 <= self.min_body_pct <= 100:
            return "Wick and body percentages must be between 0 and 100"
        return None


DEFAULT_RULES = Rules()


def measure(candle: Candle, history: list[Candle]) -> Metrics | None:
    """Metrics for `candle` vs `history` (the candles before it), or None if not measurable / below floors."""
    if len(history) < MIN_HISTORY_DAYS or candle.range <= 0 or candle.open <= 0:
        return None
    avg_volume = sum(c.quote_volume for c in history) / len(history)
    avg_range = sum(c.range for c in history) / len(history)
    if avg_volume <= 0 or avg_range <= 0:
        return None
    volume_ratio = candle.quote_volume / avg_volume
    range_ratio = candle.range / avg_range
    if volume_ratio <= BASE_VOLUME_MULT or range_ratio <= BASE_RANGE_MULT:
        return None

    if candle.close > candle.open:
        direction: Direction = "bullish"
        opposing_wick = candle.high - candle.close
    elif candle.close < candle.open:
        direction = "bearish"
        opposing_wick = candle.close - candle.low
    else:
        return None  # doji: no direction

    return Metrics(
        direction=direction,
        volume_ratio=volume_ratio,
        range_ratio=range_ratio,
        opposing_wick_pct=opposing_wick / candle.range * 100,
        body_pct=abs(candle.close - candle.open) / candle.range * 100,
        change_pct=(candle.close - candle.open) / candle.open * 100,
    )


def matches(m: Metrics | dict, rules: Rules) -> bool:
    if isinstance(m, Metrics):
        m = asdict(m)
    return (
        m["volume_ratio"] > rules.volume_mult
        and m["range_ratio"] > rules.range_mult
        and m["opposing_wick_pct"] <= rules.max_wick_pct
        and m["body_pct"] >= rules.min_body_pct
    )


def measure_recent(candles: list[Candle], count: int = 2) -> list[tuple[Candle, Metrics]]:
    """Measure the last `count` candles (default: last closed + forming), each vs its own lookback."""
    out = []
    for idx in range(max(1, len(candles) - count), len(candles)):
        m = measure(candles[idx], candles[max(0, idx - LOOKBACK_DAYS):idx])
        if m:
            out.append((candles[idx], m))
    return out


# ── Per-user rules ──────────────────────────────────────────────────────────

def get_rules(username: str) -> Rules:
    saved = load_user_data(username, RULES_NAMESPACE)
    return Rules.from_dict(saved) if isinstance(saved, dict) and saved else DEFAULT_RULES


def _all_usernames() -> list[str]:
    users = load_shared_data("users")
    if isinstance(users, dict):
        return list(users)
    return [u["username"] for u in users if isinstance(u, dict) and u.get("username")]


# ── Candidates & per-user lists ─────────────────────────────────────────────

def load_candidates() -> dict[str, dict]:
    data = load_shared_data(CANDIDATES_NAME)
    return data if isinstance(data, dict) else {}


def save_candidates(candidates: dict[str, dict], now: float | None = None) -> None:
    cutoff = (now or time.time()) - (RETENTION_DAYS + 1) * 86400
    kept = {k: c for k, c in candidates.items() if c["candle_open_ms"] / 1000 >= cutoff}
    save_shared_data(CANDIDATES_NAME, kept)


def _candidate(sym: dict, candle: Candle, m: Metrics, now: float) -> dict:
    close_ts = candle.open_time / 1000 + 86400
    return {
        "symbol": sym["symbol"],
        "base": sym["base"],
        **{k: round(v, 2) if isinstance(v, float) else v for k, v in asdict(m).items()},
        "open": candle.open,
        "close": candle.close,
        "quote_volume": round(candle.quote_volume),
        "candle_open_ms": candle.open_time,
        "candle_date": time.strftime("%Y-%m-%d", time.gmtime(candle.open_time / 1000)),
        "candle_forming": close_ts > now,
        # When it was first seen; for backfilled history, the candle's close
        "first_seen": min(now, close_ts),
        "matched": {},  # username -> epoch when it first met that user's rules
    }


def user_list(candidates: dict[str, dict], username: str, now: float | None = None) -> list[dict]:
    """A user's in-play list: newest first, one row per coin, last 30 days, max 25 coins."""
    cutoff = (now or time.time()) - RETENTION_DAYS * 86400
    hits = sorted(
        (c for c in candidates.values() if c["matched"].get(username, 0) >= cutoff),
        key=lambda c: c["matched"][username],
        reverse=True,
    )
    rows: dict[str, dict] = {}
    for c in hits:
        if c["symbol"] in rows:
            rows[c["symbol"]]["hits"] += 1
        else:
            rows[c["symbol"]] = {**c, "triggered_at": c["matched"][username], "hits": 1, "matched": None}
    return list(rows.values())[:MAX_ENTRIES]


def rematch_user(candidates: dict[str, dict], username: str, rules: Rules) -> list[str]:
    """Re-apply `rules` to every stored candidate for one user. Returns keys that newly matched."""
    added = []
    for key, c in candidates.items():
        ok = matches(c, rules)
        if ok and username not in c["matched"]:
            c["matched"][username] = c["first_seen"]
            added.append(key)
        elif not ok and username in c["matched"]:
            del c["matched"][username]
    return added


def get_user_view(username: str) -> list[dict]:
    return user_list(load_candidates(), username)


def get_scan_state() -> dict:
    state = load_shared_data(STATE_NAME)
    return state if isinstance(state, dict) else {}


# ── Market data ─────────────────────────────────────────────────────────────

async def _binance_get(client: httpx.AsyncClient, path: str, params: dict | None = None):
    last_exc: Exception | None = None
    for host in BINANCE_HOSTS:
        try:
            resp = await client.get(f"{host}{path}", params=params)
            resp.raise_for_status()
            return resp.json()
        except (httpx.HTTPError, ValueError) as exc:
            last_exc = exc
    raise RuntimeError(f"Binance {path} failed: {last_exc}")


async def get_usdt_symbols(client: httpx.AsyncClient) -> list[dict]:
    info = await _binance_get(client, "/api/v3/exchangeInfo", {"permissions": "SPOT"})
    symbols = []
    for s in info.get("symbols", []):
        base = s.get("baseAsset", "")
        if (
            s.get("quoteAsset") == "USDT"
            and s.get("status") == "TRADING"
            and base not in _EXCLUDED_BASES
            and not _LEVERAGED.search(base)
        ):
            symbols.append({"symbol": s["symbol"], "base": base})
    return symbols


async def get_daily_candles(client: httpx.AsyncClient, symbol: str, extra_days: int = 0) -> list[Candle]:
    klines = await _binance_get(
        client, "/api/v3/klines", {"symbol": symbol, "interval": "1d", "limit": LOOKBACK_DAYS + 2 + extra_days}
    )
    return [Candle.from_kline(k) for k in klines]


# ── Catalysts ───────────────────────────────────────────────────────────────

async def _ensure_catalysts(client: httpx.AsyncClient, candidates: dict[str, dict], keys: list[str], now: float) -> None:
    """Look up news (and the AI summary) for candidates that someone will actually see."""
    for key in keys:
        c = candidates[key]
        cat = c.get("catalyst")
        stale = cat and c["candle_forming"] and now - cat.get("checked_at", 0) > CATALYST_REFRESH_S
        if cat and not stale:
            # News already fetched before AI was switched on: summarize without re-fetching
            if in_play_news.ai_enabled() and "ai_verdict" not in cat and cat["headlines"]:
                c["catalyst"] = await in_play_news.summarize_catalyst(c, cat)
            continue
        cat = await in_play_news.find_catalyst(client, c["base"], c["candle_date"])
        c["catalyst"] = await in_play_news.summarize_catalyst(c, cat)


def _visible_keys(candidates: dict[str, dict], usernames: list[str]) -> list[str]:
    """Keys of candidates that are on at least one user's list (the only ones worth a news lookup)."""
    visible = set()
    for u in usernames:
        for row in user_list(candidates, u):
            visible.add(f"{row['symbol']}:{row['candle_open_ms']}")
    return sorted(visible)


async def refresh_catalysts_for(username: str) -> None:
    """After a rules change: fill in news for coins that just appeared on this user's list."""
    async with _scan_lock:
        candidates = load_candidates()
        keys = _visible_keys(candidates, [username])
        async with httpx.AsyncClient(timeout=20) as client:
            await _ensure_catalysts(client, candidates, keys, time.time())
        save_candidates(candidates)


def update_rules(username: str, rules: Rules) -> None:
    save_user_data(username, RULES_NAMESPACE, asdict(rules))
    candidates = load_candidates()
    rematch_user(candidates, username, rules)
    save_candidates(candidates)


# ── Scan loop ───────────────────────────────────────────────────────────────

_scan_lock = asyncio.Lock()


async def scan_in_play(notify: bool = True) -> dict:
    """Background task: scan all USDT pairs, match per-user rules, push new hits."""
    if _scan_lock.locked():
        return {"status": "already_running"}
    async with _scan_lock:
        return await _scan(notify)


async def _scan(notify: bool) -> dict:
    started = now = time.time()
    migrate_legacy_list()
    candidates = load_candidates()
    # First run: seed 30 days of history so lists and rule tuning work immediately
    backfill = not candidates and not get_scan_state().get("backfilled")
    errors = 0
    seen_keys: set[str] = set()

    async with httpx.AsyncClient(timeout=20) as client:
        symbols = await get_usdt_symbols(client)
        sem = asyncio.Semaphore(8)

        async def check(sym: dict):
            nonlocal errors
            async with sem:
                try:
                    candles = await get_daily_candles(client, sym["symbol"], RETENTION_DAYS if backfill else 0)
                except RuntimeError:
                    errors += 1
                    return
            for candle, m in measure_recent(candles, RETENTION_DAYS + 1 if backfill else 2):
                key = f"{sym['symbol']}:{candle.open_time}"
                seen_keys.add(key)
                fresh = _candidate(sym, candle, m, now)
                old = candidates.get(key)
                if old:  # keep identity fields; refresh the (possibly still forming) numbers
                    fresh.update(first_seen=old["first_seen"], matched=old["matched"])
                    if "catalyst" in old:
                        fresh["catalyst"] = old["catalyst"]
                candidates[key] = fresh

        await asyncio.gather(*(check(s) for s in symbols))

        # Re-apply every user's current rules to all candidates. Only candles measured in
        # this scan (i.e. moving right now) count as new hits worth a push.
        usernames = _all_usernames()
        new_hits: dict[str, list[str]] = {}
        for u in usernames:
            for key in rematch_user(candidates, u, get_rules(u)):
                if key in seen_keys and not backfill:
                    candidates[key]["matched"][u] = now
                    new_hits.setdefault(u, []).append(key)

        await _ensure_catalysts(client, candidates, _visible_keys(candidates, usernames), now)

    save_candidates(candidates, now)
    save_shared_data(STATE_NAME, {
        "last_scan": time.time(),
        "duration_s": round(time.time() - started, 1),
        "symbols_scanned": len(symbols),
        "candidates": len(candidates),
        "errors": errors,
        "backfilled": True,
    })

    pushed = 0
    if notify and not backfill:
        for u, keys in new_hits.items():
            cfg = in_play_push.get_phone_config(u)
            if not in_play_push.phone_enabled(cfg):
                continue
            current = user_list(candidates, u)
            for key in sorted(keys, key=lambda k: candidates[k]["volume_ratio"], reverse=True):
                title, body, tags = in_play_push.format_push(candidates[key], current)
                pushed += await in_play_push.send_ntfy(cfg, title, body, tags)

    total_new = sum(len(v) for v in new_hits.values())
    logger.info("in_play scan: %d symbols, %d candidates, %d new user hits, %d pushed, %d errors",
                len(symbols), len(candidates), total_new, pushed, errors)
    return {"status": "ok", "symbols_scanned": len(symbols), "new_user_hits": total_new, "pushed": pushed,
            "backfill": backfill, "errors": errors}


def migrate_legacy_list() -> None:
    """The first release kept one shared list in data/in_play.json; it is superseded by candidates."""
    legacy = DATA_DIR / "in_play.json"
    if legacy.exists():
        legacy.rename(DATA_DIR / "in_play.legacy.json")

