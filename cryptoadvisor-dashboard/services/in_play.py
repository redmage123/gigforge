"""In-play scanner — flags instruments with a volume spike plus an outsized, decisive candle.

Every 15 minutes the scanner measures the forming and last closed candle of every instrument in
the universes users have chosen (crypto perpetuals, US large caps, major ETFs, commodity/Treasury
futures), on each timeframe in use (1h ... 9d), against averages of the previous candles:

  * volume_ratio  — candle USD volume / average volume over `volume_lookback` candles
                    (stocks/futures intraday: average of the same session hour, so the busy open
                    and close don't flag every stock)
  * range_ratio   — candle range (high - low) / average range over `price_lookback` candles
  * opposing wick — bullish: upper wick, bearish: lower wick, as % of the range
  * body          — |close - open| as % of the range

A "profile" is one (timeframe, volume_lookback, price_lookback) combination; history is built per
profile and universe ("1d:60:60@crypto"). Anything above the loose BASE_* floors is stored as a
*candidate*. Each user has their own Rules (profile + universes + thresholds + days on list); a
candidate of the user's profile and universes that satisfies their thresholds enters their
in-play list (newest first, max 25) and is pushed to their phone.
"""

import asyncio
import logging
import math
import time
from collections import defaultdict
from dataclasses import asdict, dataclass, fields
from typing import Callable, Literal

import httpx

from services import in_play_news, in_play_push
from services.market import registry, universes
from services.market.models import Candle  # noqa: F401  (re-exported: tests and callers import it from here)
from services.market.providers import BINANCE_PERP, YAHOO
from services.user_data import DATA_DIR, load_shared_data, load_user_data, save_shared_data, save_user_data

logger = logging.getLogger(__name__)

# timeframe -> (Binance interval fetched, candles merged per bar, bar length in seconds)
TIMEFRAMES: dict[str, tuple[str, int, int]] = {
    "1h": ("1h", 1, 3600), "2h": ("2h", 1, 2 * 3600), "3h": ("1h", 3, 3 * 3600), "6h": ("6h", 1, 6 * 3600),
    "12h": ("12h", 1, 12 * 3600), "1d": ("1d", 1, 86400), "3d": ("3d", 1, 3 * 86400), "9d": ("3d", 3, 9 * 86400),
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
MIN_SAME_SLOT = 3  # same-hour volume samples needed before using them instead of the plain average

CANDIDATES_NAME = "in_play_candidates"
STATE_NAME = "in_play_state"
RULES_NAMESPACE = "in_play_rules"

Direction = Literal["bullish", "bearish"]


def max_lookback(timeframe: str) -> int:
    """Longest average a timeframe supports: built bars must fit in one Binance klines request."""
    return min(LOOKBACK_MAX, MAX_KLINES // TIMEFRAMES[timeframe][1] - 2)


@dataclass(frozen=True)
class Metrics:
    direction: Direction
    volume_ratio: float
    range_ratio: float
    opposing_wick_pct: float  # 0-100
    body_pct: float  # 0-100
    change_pct: float
    avg_volume: float = 0.0  # average USD volume the ratio was taken against


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
    universes: tuple = universes.DEFAULT_UNIVERSES

    @classmethod
    def from_dict(cls, d: dict | None) -> "Rules":
        out = {}
        for f in fields(cls):
            if d and d.get(f.name) is not None:
                kind, v = type(f.default), d[f.name]
                if kind is tuple:
                    out[f.name] = tuple(dict.fromkeys(str(x) for x in (v if isinstance(v, (list, tuple)) else [v])))
                else:
                    out[f.name] = str(v) if kind is str else int(float(v)) if kind is int else float(v)
        return cls(**out)

    @property
    def profile(self) -> str:
        return f"{self.timeframe}:{self.volume_lookback}:{self.price_lookback}"

    def builds(self) -> set[str]:
        """History keys this user needs: one per universe, e.g. "1d:60:60@crypto"."""
        return {f"{self.profile}@{u}" for u in self.universes}

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
        if not self.universes or any(u not in universes.UNIVERSES for u in self.universes):
            return f"Pick at least one market to scan: {', '.join(universes.UNIVERSES)}"
        return None


DEFAULT_RULES = Rules()
DEFAULT_PROFILE = DEFAULT_RULES.profile


def measure(candle: Candle, history: list[Candle], volume_lookback: int = DEFAULT_LOOKBACK,
            price_lookback: int = DEFAULT_LOOKBACK, slot_of: Callable[[Candle], int] | None = None) -> Metrics | None:
    """Metrics for `candle` vs `history` (the candles before it), or None if not measurable / below floors.

    `slot_of` (session markets, intraday bars) maps a candle to its position within its trading
    session; the volume average then uses the same position in earlier sessions when there are enough.
    """
    need = max(MIN_HISTORY_BARS, max(volume_lookback, price_lookback) // 2)
    if len(history) < need or candle.range <= 0 or candle.open <= 0:
        return None
    vol_hist, rng_hist = history[-volume_lookback:], history[-price_lookback:]
    if slot_of is not None:
        same = [c for c in vol_hist if slot_of(c) == slot_of(candle)]
        if len(same) >= MIN_SAME_SLOT:
            vol_hist = same
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


def session_slots(candles: list[Candle], bar_seconds: int) -> dict[int, int]:
    """open_time -> position within its trading session (a run of bars with no gap > 1.5 bars)."""
    slots, pos, prev = {}, 0, None
    for c in candles:
        pos = pos + 1 if prev is not None and c.open_time - prev <= bar_seconds * 1500 else 0
        slots[c.open_time] = pos
        prev = c.open_time
    return slots


def measure_recent(candles: list[Candle], count: int = 2, volume_lookback: int = DEFAULT_LOOKBACK,
                   price_lookback: int = DEFAULT_LOOKBACK, slot_of: Callable[[Candle], int] | None = None
                   ) -> list[tuple[Candle, Metrics]]:
    """Measure the last `count` candles (default: last closed + forming), each vs its own lookback."""
    window = max(volume_lookback, price_lookback)
    out = []
    for idx in range(max(1, len(candles) - count), len(candles)):
        m = measure(candles[idx], candles[max(0, idx - window):idx], volume_lookback, price_lookback, slot_of)
        if m:
            out.append((candles[idx], m))
    return out


def aggregate(candles: list[Candle], factor: int, bar_seconds: int) -> list[Candle]:
    """Merge `factor` candles into epoch-aligned bars (kept for callers; see market.providers)."""
    from services.market.providers import aggregate_epoch

    return aggregate_epoch(candles, factor, bar_seconds)


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
    """Older candidates were Binance spot pairs ("BTCUSDT"), daily candles vs 60-day averages."""
    c.setdefault("profile", DEFAULT_PROFILE)
    c.setdefault("timeframe", "1d")
    c.setdefault("volume_lookback", DEFAULT_LOOKBACK)
    c.setdefault("price_lookback", DEFAULT_LOOKBACK)
    c.setdefault("candle_label", c.get("candle_date", ""))
    if "avg_quote_volume" not in c and c.get("volume_ratio"):
        c["avg_quote_volume"] = round(c.get("quote_volume", 0) / c["volume_ratio"])
    if "instrument_id" not in c:
        base = c.get("base") or str(c.get("symbol", "")).removesuffix("USDT")
        c["instrument_id"] = f"crypto:{base.upper()}"
        c.setdefault("asset_class", "crypto")
        c.setdefault("universe", "crypto")
        c.setdefault("name", base)
    return c


def _key(c: dict) -> str:
    return f"{c['profile']}|{c['instrument_id']}|{c['candle_open_ms']}"


def load_candidates() -> dict[str, dict]:
    data = load_shared_data(CANDIDATES_NAME)
    if not isinstance(data, dict):
        return {}
    out = {}
    for key, c in data.items():
        if "instrument_id" not in c:  # legacy record and key
            c = _migrate_candidate(c)
            key = _key(c)
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


def _candidate(inst, universe: str, candle: Candle, m: Metrics, now: float, rules: Rules) -> dict:
    bar_s = TIMEFRAMES[rules.timeframe][2]
    open_s = candle.open_time / 1000
    close_ts = open_s + bar_s
    metrics = {k: round(v, 2) if isinstance(v, float) else v for k, v in asdict(m).items() if k != "avg_volume"}
    return {
        "instrument_id": inst.id,
        "asset_class": inst.asset_class,
        "universe": universe,
        "symbol": inst.symbol,
        "base": inst.symbol.removeprefix("1000") if inst.asset_class == "crypto" else inst.symbol,
        "name": inst.name,
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


def _universe(c: dict) -> str:
    return c.get("universe") or "crypto"


def user_list(candidates: dict[str, dict], username: str, now: float | None = None,
              retention_days: int = DEFAULT_RETENTION_DAYS, profile: str | None = None,
              universe_set: tuple | None = None) -> list[dict]:
    """A user's in-play list: newest first, one row per instrument, last `retention_days`, max 25."""
    cutoff = (now or time.time()) - retention_days * 86400
    hits = sorted(
        (c for c in candidates.values()
         if c["matched"].get(username, 0) >= cutoff
         and (profile is None or c.get("profile", DEFAULT_PROFILE) == profile)
         and (universe_set is None or _universe(c) in universe_set)),
        key=lambda c: c["matched"][username],
        reverse=True,
    )
    rows: dict[str, dict] = {}
    for c in hits:
        rid = c.get("instrument_id") or c["symbol"]
        if rid in rows:
            rows[rid]["hits"] += 1
        else:
            rows[rid] = {**c, "triggered_at": c["matched"][username], "hits": 1, "matched": None}
    return list(rows.values())[:MAX_ENTRIES]


def rematch_user(candidates: dict[str, dict], username: str, rules: Rules) -> list[str]:
    """Re-apply `rules` to every stored candidate for one user. Returns keys that newly matched.

    Only candidates of the user's profile and universes can match; switching drops the old matches.
    """
    added = []
    for key, c in candidates.items():
        ok = (c.get("profile", DEFAULT_PROFILE) == rules.profile and _universe(c) in rules.universes
              and matches(c, rules))
        if ok and username not in c["matched"]:
            c["matched"][username] = c["first_seen"]
            added.append(key)
        elif not ok and username in c["matched"]:
            del c["matched"][username]
    return added


def get_user_view(username: str) -> list[dict]:
    rules = get_rules(username)
    return user_list(load_candidates(), username, retention_days=rules.retention_days, profile=rules.profile,
                     universe_set=rules.universes)


def get_scan_state() -> dict:
    state = load_shared_data(STATE_NAME)
    return state if isinstance(state, dict) else {}


def _backfilled_profiles(state: dict) -> set[str]:
    """History built so far, as "profile@universe" (older states recorded crypto-only profiles)."""
    done = {p if "@" in p else f"{p}@crypto" for p in state.get("backfilled_profiles", [])}
    if state.get("backfilled") and not done:
        done.add(f"{DEFAULT_PROFILE}@crypto")  # scans before timeframes existed backfilled the daily default
    return done


def profile_ready(rules_or_profile) -> bool:
    """True once the scanner has built history for every universe the rules need."""
    built = _backfilled_profiles(get_scan_state())
    if isinstance(rules_or_profile, Rules):
        return rules_or_profile.builds() <= built
    p = rules_or_profile
    return (p if "@" in p else f"{p}@crypto") in built


# ── Market data ─────────────────────────────────────────────────────────────

def backfill_bars(timeframe: str, window: int, days: int) -> int:
    """Bars to re-measure when building a new profile's history: `days` worth, as far as fits."""
    _, factor, bar_s = TIMEFRAMES[timeframe]
    fits = MAX_KLINES // factor - window - 2
    return max(0, min(math.ceil(days * 86400 / bar_s), fits))


def _provider(universe: str):
    # Crypto: perpetual futures candles and volume (what futures traders trade); others: Yahoo
    return BINANCE_PERP if universe == "crypto" else YAHOO


# ── Catalysts ───────────────────────────────────────────────────────────────

async def _ensure_catalysts(client: httpx.AsyncClient, candidates: dict[str, dict], keys: list[str], now: float) -> None:
    """Look up news (and the AI summary) for candidates that someone will actually see.

    News is per instrument and day, so candidates of other timeframes/profiles share one lookup.
    """
    def ref(c):
        return (c.get("instrument_id") or c["base"], c["candle_date"])

    known = {ref(c): c["catalyst"] for c in candidates.values() if c.get("catalyst")}
    for key in keys:
        c = candidates[key]
        cat = c.get("catalyst") or known.get(ref(c))
        stale = cat and c["candle_forming"] and now - cat.get("checked_at", 0) > CATALYST_REFRESH_S
        if cat and not stale:
            # News already fetched before AI was switched on: summarize without re-fetching
            if in_play_news.ai_enabled() and "ai_verdict" not in cat and cat["headlines"]:
                cat = await in_play_news.summarize_catalyst(c, cat)
            c["catalyst"] = cat
            known[ref(c)] = cat
            continue
        cat = await in_play_news.find_catalyst(client, c["base"], c["candle_date"],
                                               asset_class=c.get("asset_class", "crypto"), name=c.get("name"))
        c["catalyst"] = await in_play_news.summarize_catalyst(c, cat)
        known[ref(c)] = c["catalyst"]


def _visible_keys(candidates: dict[str, dict], user_rules: dict[str, Rules]) -> list[str]:
    """Keys of candidates that are on at least one user's list (the only ones worth a news lookup)."""
    visible = set()
    for u, r in user_rules.items():
        for row in user_list(candidates, u, retention_days=r.retention_days, profile=r.profile, universe_set=r.universes):
            visible.add(_key(row))
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
    """Save rules and re-match stored candidates. Returns True if all needed history exists."""
    save_user_data(username, RULES_NAMESPACE, {**asdict(rules), "universes": list(rules.universes)})
    candidates = load_candidates()
    rematch_user(candidates, username, rules)
    save_candidates(candidates, keep_days=_keep_days(), active_profiles=_active_profiles())
    return profile_ready(rules)


# ── Scan loop ───────────────────────────────────────────────────────────────

_scan_lock = asyncio.Lock()


async def scan_in_play(notify: bool = True, only_profiles: set[str] | None = None, wait: bool = False) -> dict:
    """Background task: scan every wanted universe/timeframe, match per-user rules, push new hits.

    `only_profiles` limits the scan to some "profile@universe" builds (used right after a user
    changes settings); `wait` queues behind a running scan instead of skipping.
    """
    if _scan_lock.locked() and not wait:
        return {"status": "already_running"}
    async with _scan_lock:
        return await _scan(notify, only_profiles)


async def _scan(notify: bool, only_profiles: set[str] | None = None) -> dict:
    started = now = time.time()
    migrate_legacy_list()
    await registry.ensure_loaded()
    await universes.refresh_sp500()
    candidates = load_candidates()
    state = get_scan_state()
    built = _backfilled_profiles(state)

    user_rules = {u: get_rules(u) for u in _all_usernames()}
    # Every (profile, universe) someone needs, plus the default so "Reset to defaults" is instant
    wanted: dict[str, tuple[Rules, str]] = {f"{DEFAULT_PROFILE}@crypto": (DEFAULT_RULES, "crypto")}
    for r in user_rules.values():
        for u in r.universes:
            wanted[f"{r.profile}@{u}"] = (r, u)
    active_profiles = {DEFAULT_PROFILE} | {r.profile for r in user_rules.values()}
    if only_profiles is not None:
        wanted = {k: v for k, v in wanted.items() if k in only_profiles or k.split("@")[0] in only_profiles}
    new_builds = {k for k in wanted if k not in built}
    keep_days = max([DEFAULT_RETENTION_DAYS] + [r.retention_days for r in user_rules.values()])

    groups: dict[tuple[str, str], list[tuple[str, Rules]]] = defaultdict(list)
    for k, (r, u) in wanted.items():
        groups[(r.timeframe, u)].append((k, r))

    errors = 0
    scanned: dict[str, int] = {}
    skipped: list[str] = []
    seen_keys: set[str] = set()  # candles measured this scan in already-built histories (push-worthy)
    done_builds: set[str] = set()

    async with httpx.AsyncClient(timeout=20, headers={"User-Agent": "Mozilla/5.0 AssetAdvisor"}) as client:
        sem = asyncio.Semaphore(8)
        for (timeframe, universe), builds in groups.items():
            building = any(k in new_builds for k, _ in builds)
            if not building and not universes.market_open(universe, now):
                skipped.append(f"{universe}/{timeframe}")  # market closed: no new bars to measure
                continue
            members = universes.members(universe)
            provider = _provider(universe)
            window = max(max(r.volume_lookback, r.price_lookback) for _, r in builds)
            bf_bars = backfill_bars(timeframe, window, keep_days) if building else 0
            bar_s = TIMEFRAMES[timeframe][2]
            group_errors = 0

            async def check(inst, timeframe=timeframe, universe=universe, builds=builds, window=window,
                            bf_bars=bf_bars, bar_s=bar_s, provider=provider):
                nonlocal errors, group_errors
                async with sem:
                    try:
                        candles = await provider.candles(inst, timeframe, window + 2 + bf_bars, client)
                    except Exception:  # noqa: BLE001 — one symbol failing must not stop the scan
                        errors += 1
                        group_errors += 1
                        return
                slot_of = None
                if inst.sessions != "24/7" and bar_s < 86400:
                    slots = session_slots(candles, bar_s)
                    slot_of = lambda c, slots=slots: slots.get(c.open_time, -1)  # noqa: E731
                for k, r in builds:
                    is_new = k in new_builds
                    count = bf_bars + 1 if is_new else 2
                    for candle, m in measure_recent(candles, count, r.volume_lookback, r.price_lookback, slot_of):
                        fresh = _candidate(inst, universe, candle, m, now, r)
                        key = _key(fresh)
                        if not is_new:
                            seen_keys.add(key)
                        old = candidates.get(key)
                        if old:  # keep identity fields; refresh the (possibly still forming) numbers
                            fresh.update(first_seen=old["first_seen"], matched=old["matched"])
                            if "catalyst" in old:
                                fresh["catalyst"] = old["catalyst"]
                        candidates[key] = fresh

            await asyncio.gather(*(check(i) for i in members))
            scanned[f"{universe}/{timeframe}"] = len(members)
            if members and group_errors < len(members):
                done_builds.update(k for k, _ in builds)

        # Re-apply every affected user's rules. Only candles measured in this scan, in histories
        # that already existed (i.e. moving right now), count as new hits worth a push.
        new_hits: dict[str, list[str]] = {}
        for u, r in user_rules.items():
            if not (r.builds() & set(wanted)):
                continue
            for key in rematch_user(candidates, u, r):
                if key in seen_keys:
                    candidates[key]["matched"][u] = now
                    new_hits.setdefault(u, []).append(key)

        scanned_users = {u: r for u, r in user_rules.items() if r.builds() & set(wanted)}
        await _ensure_catalysts(client, candidates, _visible_keys(candidates, scanned_users), now)

    save_candidates(candidates, now, keep_days, active_profiles)
    all_built = {k for k in (built | done_builds) if k.split("@")[0] in active_profiles}
    save_shared_data(STATE_NAME, {
        **state,
        "last_scan": time.time(),
        "duration_s": round(time.time() - started, 1),
        "symbols_scanned": sum(scanned.values()) or state.get("symbols_scanned", 0),
        "scanned": scanned or state.get("scanned", {}),
        "skipped_closed": skipped,
        "timeframes": sorted({g[0] for g in groups}),
        "candidates": len(candidates),
        "errors": errors,
        "backfilled": True,
        "backfilled_profiles": sorted(all_built),
    })

    pushed = 0
    if notify:
        for u, keys in new_hits.items():
            cfg = in_play_push.get_phone_config(u)
            if not in_play_push.phone_enabled(cfg):
                continue
            r = user_rules[u]
            current = user_list(candidates, u, retention_days=r.retention_days, profile=r.profile, universe_set=r.universes)
            for key in sorted(keys, key=lambda k: candidates[k]["volume_ratio"], reverse=True):
                title, body, tags = in_play_push.format_push(candidates[key], current)
                pushed += await in_play_push.send_ntfy(cfg, title, body, tags)

    total_new = sum(len(v) for v in new_hits.values())
    logger.info("in_play scan: %s, %d candidates, %d new user hits, %d pushed, %d errors%s%s",
                scanned, len(candidates), total_new, pushed, errors,
                f", built {sorted(new_builds & done_builds)}" if new_builds & done_builds else "",
                f", closed {skipped}" if skipped else "")
    return {"status": "ok", "scanned": scanned, "new_user_hits": total_new, "pushed": pushed,
            "built_profiles": sorted(new_builds & done_builds), "skipped_closed": skipped, "errors": errors}


def migrate_legacy_list() -> None:
    """The first release kept one shared list in data/in_play.json; it is superseded by candidates."""
    legacy = DATA_DIR / "in_play.json"
    if legacy.exists():
        legacy.rename(DATA_DIR / "in_play.legacy.json")
