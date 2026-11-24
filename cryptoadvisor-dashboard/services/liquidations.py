"""Futures liquidations, collected live from Binance's free public liquidation stream.

Binance no longer serves liquidation history over public REST, and there is no free, key-less
history source. Its USD-M futures WebSocket stream `!forceOrder@arr` is free, so this module listens
to it in-process (started lazily by the first page view) and keeps a bounded, rolling in-memory
window. Consequences the page states plainly:

  * data covers only the time since this app process started collecting, up to WINDOW_HOURS;
  * a restart empties it, and events during a dropped connection are missed;
  * Binance pushes at most one liquidation per symbol per second (the latest), so totals are a
    lower bound, not every liquidation.
"""

import asyncio
import json
import logging
import time
from collections import deque

logger = logging.getLogger(__name__)

# Binance moved market streams under /market; the legacy /ws path is kept as a fallback.
STREAM_URLS = (
    "wss://fstream.binance.com/market/ws/!forceOrder@arr",
    "wss://fstream.binance.com/ws/!forceOrder@arr",
)
WINDOW_HOURS = 24
MAX_EVENTS = 50_000  # memory bound (a busy day is a few thousand events)
SOURCE = "Binance USD-M futures liquidation stream"

_events: deque = deque(maxlen=MAX_EVENTS)
_state = {"task": None, "started_at": None, "connected": False, "last_error": None, "reconnects": 0}


def parse_event(msg: dict) -> dict | None:
    """One stream message -> {symbol, side, quantity, price, usd_value, time_ms}, or None if malformed.

    A SELL order liquidates a long position; a BUY order liquidates a short.
    """
    o = msg.get("o") if isinstance(msg, dict) else None
    if not isinstance(o, dict):
        return None
    try:
        qty = float(o.get("z") or o.get("q") or 0)  # z = filled quantity
        price = float(o.get("ap") or 0) or float(o.get("p") or 0)  # ap = average fill price
        ts = int(o.get("T") or msg.get("E") or 0)
    except (TypeError, ValueError):
        return None
    side = {"SELL": "long", "BUY": "short"}.get(str(o.get("S", "")).upper())
    if not side or qty <= 0 or price <= 0 or not o.get("s"):
        return None
    return {"symbol": o["s"], "side": side, "quantity": qty, "price": price,
            "usd_value": round(qty * price, 2), "time_ms": ts}


def _prune(now: float | None = None) -> None:
    cutoff = ((now or time.time()) - WINDOW_HOURS * 3600) * 1000
    while _events and _events[0]["time_ms"] < cutoff:
        _events.popleft()


def record(event: dict) -> None:
    _events.append(event)


async def _collect() -> None:
    import websockets  # declared dependency; imported here so tests never need a socket

    delay, i = 5, 0
    while True:
        url = STREAM_URLS[i % len(STREAM_URLS)]
        try:
            async with websockets.connect(url, open_timeout=15, ping_interval=60) as ws:
                _state["connected"], _state["last_error"] = True, None
                _state["started_at"] = _state["started_at"] or time.time()
                delay = 5
                async for raw in ws:
                    try:
                        ev = parse_event(json.loads(raw))
                    except ValueError:
                        ev = None
                    if ev:
                        record(ev)
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # network errors, closed sockets: reconnect with backoff
            _state["last_error"] = f"{exc.__class__.__name__}: {exc}"[:200]
            logger.warning("liquidations stream %s failed: %s", url, exc)
        _state["connected"] = False
        _state["reconnects"] += 1
        i += 1
        await asyncio.sleep(delay)
        delay = min(delay * 2, 120)


def ensure_collector() -> None:
    """Start the stream listener on first use (idempotent; restarts it if it ever died)."""
    task = _state["task"]
    if task is None or task.done():
        _state["task"] = asyncio.get_running_loop().create_task(_collect())


def status(now: float | None = None) -> dict:
    now = now or time.time()
    started = _state["started_at"]
    covered_from = max(started, now - WINDOW_HOURS * 3600) if started else None
    return {
        "source": SOURCE,
        "collecting": bool(_state["connected"]),
        "collecting_since": started,
        "window_start": covered_from,
        "window_hours": WINDOW_HOURS,
        "covered_hours": round((now - covered_from) / 3600, 2) if covered_from else 0.0,
        "last_error": _state["last_error"],
        "reconnects": _state["reconnects"],
        "sampled": True,  # at most one event per symbol per second
    }


def recent(limit: int = 100) -> list[dict]:
    _prune()
    return sorted(_events, key=lambda e: e["time_ms"], reverse=True)[:limit]


def summarize(events) -> dict:
    """Totals over the given events (pure)."""
    events = list(events)
    longs = sum(e["usd_value"] for e in events if e["side"] == "long")
    shorts = sum(e["usd_value"] for e in events if e["side"] == "short")
    by_symbol: dict[str, float] = {}
    for e in events:
        by_symbol[e["symbol"]] = by_symbol.get(e["symbol"], 0.0) + e["usd_value"]
    top = sorted(by_symbol.items(), key=lambda kv: kv[1], reverse=True)
    largest = max(events, key=lambda e: e["usd_value"]) if events else None
    total = longs + shorts
    return {
        "count": len(events),
        "total_usd": round(total, 2),
        "total_long_usd": round(longs, 2),
        "total_short_usd": round(shorts, 2),
        "long_pct": round(longs / total * 100, 2) if total else None,
        "largest": largest,
        "most_liquidated_symbol": top[0][0] if top else None,
        "by_symbol": [{"symbol": s, "usd_value": round(v, 2)} for s, v in top[:10]],
    }


def summary() -> dict:
    _prune()
    return summarize(_events)


def _reset_for_tests() -> None:
    _events.clear()
    _state.update({"task": None, "started_at": None, "connected": False, "last_error": None, "reconnects": 0})
