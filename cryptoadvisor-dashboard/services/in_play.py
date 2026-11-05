"""In-play scanner — flags coins with a volume spike plus an outsized, decisive candle.

Every 15 minutes the scanner measures the forming and last closed candle of every Binance spot
USDT pair, on each timeframe some user has chosen (1h ... 9d), against averages of the previous
candles:

  * volume_ratio  — candle quote volume / average quote volume over `volume_lookback` candles
  * range_ratio   — candle range (high - low) / average range over `price_lookback` candles
  * opposing wick — bullish: upper wick, bearish: lower wick, as % of the range
  * body          — |close - open| as % of the range

A "profile" is one (timeframe, volume_lookback, price_lookback) combination. Anything above the
loose BASE_* floors is stored as a *candidate* of that profile. Each user has their own Rules
(profile + thresholds + how many days coins stay listed); a candidate of the user's profile that
satisfies their thresholds enters their in-play list (newest first, max 25 coins) and is pushed
to their phone. Changing thresholds re-evaluates stored candidates immediately; switching to a
profile nobody has used yet backfills its history first.
"""

import asyncio
import logging
import math
import re
import time
from collections import defaultdict
from dataclasses import asdict, dataclass, fields
from typing import Literal

import httpx

from services import in_play_news, in_play_push
from services.user_data import DATA_DIR, load_shared_data, load_user_data, save_shared_data, save_user_data

logger = logging.getLogger(__name__)

# timeframe -> (Binance interval fetched, candles merged per bar, bar length in seconds).
# 3h and 9d are not Binance intervals; they are built from 1h and 3d candles.
TIMEFRAMES: dict[str, tuple[str, int, int]] = {
    "1h": ("1h", 1, 3600),
    "2h": ("2h", 1, 2 * 3600),
    "3h": ("1h", 3, 3 * 3600),
    "6h": ("6h", 1, 6 * 3600),
    "12h": ("12h", 1, 12 * 3600),
    "1d": ("1d", 1, 86400),
    "3d": ("3d", 1, 3 * 86400),
    "9d": ("3d", 3, 9 * 86400),
}
MAX_KLINES = 1000  # Binance klines limit per request
LOOKBACK_MIN = 10
LOOKBACK_MAX = 500
DEFAULT_LOOKBACK = 60
MIN_HISTORY_BARS = 10
RETENTION_MIN_DAYS = 1
RETENTION_MAX_DAYS = 90
DEFAULT_RETENTION_DAYS = 14
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


def max_lookback(timeframe: str) -> int:
    """Longest average a timeframe supports: built bars must fit in one klines request."""
    return min(LOOKBACK_MAX, MAX_KLINES // TIMEFRAMES[timeframe][1] - 2)


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
    avg_volume: float = 0.0  # average quote volume the ratio was taken against


@dataclass(frozen=True)
class Rules:
    volume_mult: float = 4.0
    range_mult: float = 3.0
    max_wick_pct: float = 25.0
    min_body_pct: float = 50.0
    timeframe: str = "1d"
    volume_lookback: int = DEFAULT_LOOKBACK  # candles of `timeframe`
    price_lookback: int = DEFAULT_LOOKBACK  # candles of `timeframe`
    retention_days: int = DEFAULT_RETENTION_DAYS

    @classmethod
    def from_dict(cls, d: dict | None) -> "Rules":
        out = {}
        for f in fields(cls):
            if d and d.get(f.name) is not None:
                kind = type(f.default)
                out[f.name] = str(d[f.name]) if kind is str else int(float(d[f.name])) if kind is int else float(d[f.name])
        return cls(**out)

    @property
    def profile(self) -> str:
        return f"{self.timeframe}:{self.volume_lookback}:{self.price_lookback}"

    def validate(self) -> str | None:
        if self.volume_mult < BASE_VOLUME_MULT or self.volume_mult > 100:
            return f"Volume multiple must be between {BASE_VOLUME_MULT:g} and 100"
        if self.range_mult < BASE_RANGE_MULT or self.range_mult > 100:
            return f"Candle multiple must be between {BASE_RANGE_MULT:g} and 100"
        if not 0 <= self.max_wick_pct <= 100 or not 0 <= self.min_body_pct <= 100:
            return "Wick and body percentages must be between 0 and 100"
        if self.timeframe not in TIMEFRAMES:
            return f"Timeframe must be one of {', '.join(TIMEFRAMES)}"
        top = max_lookback(self.timeframe)
        for name, value in (("Volume", self.volume_lookback), ("Price", self.price_lookback)):
            if not LOOKBACK_MIN <= value <= top:
                return f"{name} averaging period must be {LOOKBACK_MIN}-{top} candles on {self.timeframe}"
        if not RETENTION_MIN_DAYS <= self.retention_days <= RETENTION_MAX_DAYS:
            return f"Days on list must be {RETENTION_MIN_DAYS}-{RETENTION_MAX_DAYS}"
        return None


DEFAULT_RULES = Rules()
DEFAULT_PROFILE = DEFAULT_RULES.profile


def measure(candle: Candle, history: list[Candle], volume_lookback: int = DEFAULT_LOOKBACK,
            price_lookback: int = DEFAULT_LOOKBACK) -> Metrics | None:
    """Metrics for `candle` vs `history` (the candles before it), or None if not measurable / below floors."""
    need = max(MIN_HISTORY_BARS, max(volume_lookback, price_lookback) // 2)
    if len(history) < need or candle.range <= 0 or candle.open <= 0:
        return None
    vol_hist, rng_hist = history[-volume_lookback:], history[-price_lookback:]
    avg_volume = sum(c.quote_volume for c in vol_hist) / len(vol_hist)
    avg_range = sum(c.range for c in rng_hist) / len(rng_hist)
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
        avg_volume=avg_volume,
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


def measure_recent(candles: list[Candle], count: int = 2, volume_lookback: int = DEFAULT_LOOKBACK,
                   price_lookback: int = DEFAULT_LOOKBACK) -> list[tuple[Candle, Metrics]]:
    """Measure the last `count` candles (default: last closed + forming), each vs its own lookback."""
    window = max(volume_lookback, price_lookback)
    out = []
    for idx in range(max(1, len(candles) - count), len(candles)):
        m = measure(candles[idx], candles[max(0, idx - window):idx], volume_lookback, price_lookback)
        if m:
            out.append((candles[idx], m))
    return out


def aggregate(candles: list[Candle], factor: int, bar_seconds: int) -> list[Candle]:
    """Merge `factor` consecutive candles into one bar of `bar_seconds` (3h from 1h, 9d from 3d).

    Bars are bucketed by epoch-aligned windows. An incomplete bucket is dropped, except the last
    one, which is the forming bar.
    """
    if factor == 1:
        return candles
    bucket_ms = bar_seconds * 1000
    groups: dict[int, list[Candle]] = defaultdict(list)
    for c in candles:
        groups[c.open_time // bucket_ms].append(c)
    keys = sorted(groups)
    bars = []
    for i, k in enumerate(keys):
        g = groups[k]
        if len(g) < factor and i != len(keys) - 1:
            continue
        bars.append(Candle(g[0].open_time, g[0].open, max(c.high for c in g), min(c.low for c in g),
                           g[-1].close, sum(c.quote_volume for c in g)))
    return bars


# ── Per-user rules ──────────────────────────────────────────────────────────

def get_rules(username: str) -> Rules:
    saved = load_user_data(username, RULES_NAMESPACE)
    if not (isinstance(saved, dict) and saved):
        return DEFAULT_RULES
    rules = Rules.from_dict(saved)
    return rules if rules.validate() is None else DEFAULT_RULES


def _all_usernames() -> list[str]:
    users = load_shared_data("users")
    if isinstance(users, dict):
        return list(users)
    return [u["username"] for u in users if isinstance(u, dict) and u.get("username")]


# ── Candidates & per-user lists ─────────────────────────────────────────────

def _migrate_candidate(c: dict) -> dict:
    """Candidates from before timeframes existed were daily candles vs 60-day averages."""
    c.setdefault("profile", DEFAULT_PROFILE)
    c.setdefault("timeframe", "1d")
    c.setdefault("volume_lookback", DEFAULT_LOOKBACK)
    c.setdefault("price_lookback", DEFAULT_LOOKBACK)
    c.setdefault("candle_label", c.get("candle_date", ""))
    if "avg_quote_volume" not in c and c.get("volume_ratio"):
        c["avg_quote_volume"] = round(c.get("quote_volume", 0) / c["volume_ratio"])
    return c


def load_candidates() -> dict[str, dict]:
    data = load_shared_data(CANDIDATES_NAME)
    if not isinstance(data, dict):
        return {}
    out = {}
    for key, c in data.items():
        if "|" not in key:  # legacy "SYMBOL:open_ms" key
            c = _migrate_candidate(c)
            key = f"{c['profile']}|{c['symbol']}|{c['candle_open_ms']}"
        out[key] = c
    return out


def save_candidates(candidates: dict[str, dict], now: float | None = None, keep_days: int | None = None,
                    active_profiles: set[str] | None = None) -> None:
    """Persist candidates younger than `keep_days` (+1) whose profile someone still uses."""
    cutoff = (now or time.time()) - ((keep_days or RETENTION_MAX_DAYS) + 1) * 86400
    kept = {
        k: c for k, c in candidates.items()
        if c["candle_open_ms"] / 1000 >= cutoff
        and (active_profiles is None or c.get("profile", DEFAULT_PROFILE) in active_profiles)
    }
    save_shared_data(CANDIDATES_NAME, kept)


def _candidate(sym: dict, candle: Candle, m: Metrics, now: float, rules: Rules) -> dict:
    bar_s = TIMEFRAMES[rules.timeframe][2]
    open_s = candle.open_time / 1000
    close_ts = open_s + bar_s
    metrics = {k: round(v, 2) if isinstance(v, float) else v for k, v in asdict(m).items() if k != "avg_volume"}
    return {
        "symbol": sym["symbol"],
        "base": sym["base"],
        **metrics,
        "open": candle.open,
        "close": candle.close,
        "quote_volume": round(candle.quote_volume),
        "avg_quote_volume": round(m.avg_volume),
        "profile": rules.profile,
        "timeframe": rules.timeframe,
        "volume_lookback": rules.volume_lookback,
        "price_lookback": rules.price_lookback,
        "candle_open_ms": candle.open_time,
        "candle_date": time.strftime("%Y-%m-%d", time.gmtime(open_s)),
        "candle_label": time.strftime("%Y-%m-%d" if bar_s >= 86400 else "%Y-%m-%d %H:%M UTC", time.gmtime(open_s)),
        "candle_forming": close_ts > now,
        # When it was first seen; for backfilled history, the candle's close
        "first_seen": min(now, close_ts),
        "matched": {},  # username -> epoch when it first met that user's rules
    }


def user_list(candidates: dict[str, dict], username: str, now: float | None = None,
              retention_days: int = DEFAULT_RETENTION_DAYS, profile: str | None = None) -> list[dict]:
    """A user's in-play list: newest first, one row per coin, last `retention_days`, max 25 coins."""
    cutoff = (now or time.time()) - retention_days * 86400
    hits = sorted(
        (c for c in candidates.values()
         if c["matched"].get(username, 0) >= cutoff
         and (profile is None or c.get("profile", DEFAULT_PROFILE) == profile)),
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
    """Re-apply `rules` to every stored candidate for one user. Returns keys that newly matched.

    Only candidates of the user's profile can match; switching profile drops the old matches.
    """
    added = []
    for key, c in candidates.items():
        ok = c.get("profile", DEFAULT_PROFILE) == rules.profile and matches(c, rules)
        if ok and username not in c["matched"]:
            c["matched"][username] = c["first_seen"]
            added.append(key)
        elif not ok and username in c["matched"]:
            del c["matched"][username]
    return added


def get_user_view(username: str) -> list[dict]:
    rules = get_rules(username)
    return user_list(load_candidates(), username, retention_days=rules.retention_days, profile=rules.profile)


def get_scan_state() -> dict:
    state = load_shared_data(STATE_NAME)
    return state if isinstance(state, dict) else {}


def _backfilled_profiles(state: dict) -> set[str]:
    done = set(state.get("backfilled_profiles", []))
    if state.get("backfilled") and not done:
        done.add(DEFAULT_PROFILE)  # scans before timeframes existed backfilled the daily default
    return done


def profile_ready(profile: str) -> bool:
    """True once the scanner has built history for this profile."""
    return profile in _backfilled_profiles(get_scan_state())


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


async def get_candles(client: httpx.AsyncClient, symbol: str, timeframe: str, bars: int) -> list[Candle]:
    """The last `bars` bars of `timeframe` (built from smaller Binance candles where needed)."""
    interval, factor, bar_s = TIMEFRAMES[timeframe]
    limit = min(MAX_KLINES, bars * factor)
    klines = await _binance_get(client, "/api/v3/klines", {"symbol": symbol, "interval": interval, "limit": limit})
    return aggregate([Candle.from_kline(k) for k in klines], factor, bar_s)


def backfill_bars(timeframe: str, window: int, days: int) -> int:
    """Bars to re-measure when building a new profile's history: `days` worth, as far as fits."""
    _, factor, bar_s = TIMEFRAMES[timeframe]
    fits = MAX_KLINES // factor - window - 2
    return max(0, min(math.ceil(days * 86400 / bar_s), fits))


# ── Catalysts ───────────────────────────────────────────────────────────────

async def _ensure_catalysts(client: httpx.AsyncClient, candidates: dict[str, dict], keys: list[str], now: float) -> None:
    """Look up news (and the AI summary) for candidates that someone will actually see.

    News is per coin and day, so candidates of other timeframes/profiles share one lookup.
    """
    known = {(c["base"], c["candle_date"]): c["catalyst"] for c in candidates.values() if c.get("catalyst")}
    for key in keys:
        c = candidates[key]
        cat = c.get("catalyst") or known.get((c["base"], c["candle_date"]))
        stale = cat and c["candle_forming"] and now - cat.get("checked_at", 0) > CATALYST_REFRESH_S
        if cat and not stale:
            # News already fetched before AI was switched on: summarize without re-fetching
            if in_play_news.ai_enabled() and "ai_verdict" not in cat and cat["headlines"]:
                cat = await in_play_news.summarize_catalyst(c, cat)
            c["catalyst"] = cat
            known[(c["base"], c["candle_date"])] = cat
            continue
        cat = await in_play_news.find_catalyst(client, c["base"], c["candle_date"])
        c["catalyst"] = await in_play_news.summarize_catalyst(c, cat)
        known[(c["base"], c["candle_date"])] = c["catalyst"]


def _visible_keys(candidates: dict[str, dict], user_rules: dict[str, Rules]) -> list[str]:
    """Keys of candidates that are on at least one user's list (the only ones worth a news lookup)."""
    visible = set()
    for u, r in user_rules.items():
        for row in user_list(candidates, u, retention_days=r.retention_days, profile=r.profile):
            visible.add(f"{row['profile']}|{row['symbol']}|{row['candle_open_ms']}")
    return sorted(visible)


async def refresh_catalysts_for(username: str) -> None:
    """After a rules change: fill in news for coins that just appeared on this user's list."""
    async with _scan_lock:
        candidates = load_candidates()
        keys = _visible_keys(candidates, {username: get_rules(username)})
        async with httpx.AsyncClient(timeout=20) as client:
            await _ensure_catalysts(client, candidates, keys, time.time())
        save_candidates(candidates, keep_days=_keep_days(), active_profiles=_active_profiles())


def _active_profiles() -> set[str]:
    return {DEFAULT_PROFILE} | {get_rules(u).profile for u in _all_usernames()}


def _keep_days() -> int:
    return max([DEFAULT_RETENTION_DAYS] + [get_rules(u).retention_days for u in _all_usernames()])


def update_rules(username: str, rules: Rules) -> bool:
    """Save rules and re-match stored candidates. Returns True if the profile already has history."""
    save_user_data(username, RULES_NAMESPACE, asdict(rules))
    candidates = load_candidates()
    rematch_user(candidates, username, rules)
    save_candidates(candidates, keep_days=_keep_days(), active_profiles=_active_profiles())
    return profile_ready(rules.profile)


# ── Scan loop ───────────────────────────────────────────────────────────────

_scan_lock = asyncio.Lock()


async def scan_in_play(notify: bool = True, only_profiles: set[str] | None = None, wait: bool = False) -> dict:
    """Background task: scan all USDT pairs, match per-user rules, push new hits.

    `only_profiles` limits the scan (used to build history right after a user switches profile);
    `wait` queues behind a running scan instead of skipping.
    """
    if _scan_lock.locked() and not wait:
        return {"status": "already_running"}
    async with _scan_lock:
        return await _scan(notify, only_profiles)


async def _scan(notify: bool, only_profiles: set[str] | None = None) -> dict:
    started = now = time.time()
    migrate_legacy_list()
    candidates = load_candidates()
    state = get_scan_state()
    backfilled = _backfilled_profiles(state)

    user_rules = {u: get_rules(u) for u in _all_usernames()}
    wanted = {DEFAULT_PROFILE: DEFAULT_RULES, **{r.profile: r for r in user_rules.values()}}
    active_profiles = set(wanted)
    if only_profiles is not None:
        wanted = {p: r for p, r in wanted.items() if p in only_profiles}
    new_profiles = {p for p in wanted if p not in backfilled}
    keep_days = max([DEFAULT_RETENTION_DAYS] + [r.retention_days for r in user_rules.values()])

    by_timeframe: dict[str, list[Rules]] = defaultdict(list)
    for r in wanted.values():
        by_timeframe[r.timeframe].append(r)

    errors = 0
    seen_keys: set[str] = set()  # candles measured this scan in already-built profiles (push-worthy)
    symbols: list[dict] = []

    async with httpx.AsyncClient(timeout=20) as client:
        symbols = await get_usdt_symbols(client)
        sem = asyncio.Semaphore(8)

        for timeframe, profiles in by_timeframe.items():
            window = max(max(r.volume_lookback, r.price_lookback) for r in profiles)
            needs_backfill = any(r.profile in new_profiles for r in profiles)
            bf_bars = backfill_bars(timeframe, window, keep_days) if needs_backfill else 0

            async def check(sym: dict, timeframe=timeframe, profiles=profiles, window=window, bf_bars=bf_bars):
                nonlocal errors
                async with sem:
                    try:
                        candles = await get_candles(client, sym["symbol"], timeframe, window + 2 + bf_bars)
                    except RuntimeError:
                        errors += 1
                        return
                for r in profiles:
                    building = r.profile in new_profiles
                    count = bf_bars + 1 if building else 2
                    for candle, m in measure_recent(candles, count, r.volume_lookback, r.price_lookback):
                        key = f"{r.profile}|{sym['symbol']}|{candle.open_time}"
                        if not building:
                            seen_keys.add(key)
                        fresh = _candidate(sym, candle, m, now, r)
                        old = candidates.get(key)
                        if old:  # keep identity fields; refresh the (possibly still forming) numbers
                            fresh.update(first_seen=old["first_seen"], matched=old["matched"])
                            if "catalyst" in old:
                                fresh["catalyst"] = old["catalyst"]
                        candidates[key] = fresh

            await asyncio.gather(*(check(s) for s in symbols))

        # Re-apply every affected user's rules. Only candles measured in this scan, in profiles
        # that already had history (i.e. moving right now), count as new hits worth a push.
        new_hits: dict[str, list[str]] = {}
        for u, r in user_rules.items():
            if r.profile not in wanted:
                continue
            for key in rematch_user(candidates, u, r):
                if key in seen_keys:
                    candidates[key]["matched"][u] = now
                    new_hits.setdefault(u, []).append(key)

        scanned_users = {u: r for u, r in user_rules.items() if r.profile in wanted}
        await _ensure_catalysts(client, candidates, _visible_keys(candidates, scanned_users), now)

    save_candidates(candidates, now, keep_days, active_profiles)
    done = (backfilled | set(wanted)) if errors < max(1, len(symbols)) else backfilled
    save_shared_data(STATE_NAME, {
        "last_scan": time.time(),
        "duration_s": round(time.time() - started, 1),
        "symbols_scanned": len(symbols),
        "timeframes": sorted(by_timeframe),
        "candidates": len(candidates),
        "errors": errors,
        "backfilled": True,
        "backfilled_profiles": sorted(done & active_profiles),
    })

    pushed = 0
    if notify:
        for u, keys in new_hits.items():
            cfg = in_play_push.get_phone_config(u)
            if not in_play_push.phone_enabled(cfg):
                continue
            r = user_rules[u]
            current = user_list(candidates, u, retention_days=r.retention_days, profile=r.profile)
            for key in sorted(keys, key=lambda k: candidates[k]["volume_ratio"], reverse=True):
                title, body, tags = in_play_push.format_push(candidates[key], current)
                pushed += await in_play_push.send_ntfy(cfg, title, body, tags)

    total_new = sum(len(v) for v in new_hits.values())
    logger.info("in_play scan: %d symbols, timeframes %s, %d candidates, %d new user hits, %d pushed, %d errors%s",
                len(symbols), sorted(by_timeframe), len(candidates), total_new, pushed, errors,
                f", built history for {sorted(new_profiles)}" if new_profiles else "")
    return {"status": "ok", "symbols_scanned": len(symbols), "new_user_hits": total_new, "pushed": pushed,
            "built_profiles": sorted(new_profiles), "errors": errors}


def migrate_legacy_list() -> None:
    """The first release kept one shared list in data/in_play.json; it is superseded by candidates."""
    legacy = DATA_DIR / "in_play.json"
    if legacy.exists():
        legacy.rename(DATA_DIR / "in_play.legacy.json")
