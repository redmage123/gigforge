"""Alerts on any instrument: price, RSI or Stochastic RSI, on live quotes or on candle closes.

An alert is {instrument_id, metric, timeframe, direction (above|below), target_price}:
- metric "price" (default), "rsi" (RSI 14) or "stoch_k" (Stochastic RSI %K, 14/14/3/3);
  for the indicators target_price holds the level (0-100).
- timeframe "live" (default, price only): checked every minute against the latest quote.
  Any candle size ("30m", "1h", "1d"...): the alert fires when a candle of that size *closes* past
  the level. Only candles that close after the alert was created count, so it never fires on history.

Older alerts stored CoinGecko ids in coin_id; they are converted when read. `coin_id` is kept as an
alias of instrument_id.
"""

import logging
import time
import uuid

from services import market
from services.market import registry
from services.market.providers import TIMEFRAMES
from services.notifications import add_notification
from services.user_data import load_user_data, save_user_data, users_with

logger = logging.getLogger(__name__)
NAMESPACE = "alerts"
METRICS = {"price": "Price", "rsi": "RSI (14)", "stoch_k": "Stoch RSI %K"}
LIVE = "live"
CANDLE_NAMES = {
    "5m": "5-minute", "15m": "15-minute", "30m": "30-minute", "1h": "1-hour", "2h": "2-hour", "3h": "3-hour",
    "4h": "4-hour", "6h": "6-hour", "12h": "12-hour", "1d": "daily", "3d": "3-day", "1w": "weekly", "9d": "9-day",
}


def normalize_alert(a: dict) -> dict:
    a = dict(a)
    iid = a.get("instrument_id")
    if not iid:
        legacy = a.get("coin_id") or ""
        iid = legacy if ":" in legacy else (registry.from_coingecko_id(legacy) or f"crypto:{legacy.upper()}")
    a["instrument_id"] = a["coin_id"] = iid
    a.setdefault("metric", "price")
    a.setdefault("timeframe", LIVE)
    return a


def validate(metric: str, timeframe: str, target: float) -> str | None:
    if metric not in METRICS:
        return f"metric must be one of {', '.join(METRICS)}"
    if timeframe != LIVE and timeframe not in TIMEFRAMES:
        return f"time scale must be live or one of {', '.join(TIMEFRAMES)}"
    if metric != "price":
        if timeframe == LIVE:
            return "RSI and Stochastic RSI alerts need a candle time scale (for example 30m or 1h)"
        if not 0 < target < 100:
            return "the level must be between 0 and 100"
    elif target <= 0:
        return "target price must be positive"
    return None


def describe(a: dict, decimals: int = 2) -> str:
    """'30-minute close: RSI (14) above 70' / 'Live price at or below 61,000'."""
    level = f"{a['target_price']:,.{decimals if a['metric'] == 'price' else 1}f}".rstrip("0").rstrip(".") \
        if a["metric"] != "price" else f"{a['target_price']:,.{decimals}f}"
    side = "at or above" if a["direction"] == "above" else "at or below"
    if a["timeframe"] == LIVE:
        return f"Live price {side} {level}"
    return f"{CANDLE_NAMES[a['timeframe']]} close: {METRICS[a['metric']]} {side} {level}"


def get_alerts(username: str) -> list[dict]:
    raw = load_user_data(username, NAMESPACE)
    return [normalize_alert(a) for a in raw] if isinstance(raw, list) else []


def _save(username: str, alerts: list[dict]) -> None:
    save_user_data(username, NAMESPACE, alerts)


def add_alert(username: str, instrument_id: str, direction: str, target_price: float,
              notes: str = "", support: float = 0, resistance: float = 0,
              metric: str = "price", timeframe: str = LIVE) -> dict:
    if direction not in ("above", "below"):
        raise ValueError("direction must be above or below")
    err = validate(metric, timeframe, target_price)
    if err:
        raise ValueError(err)
    alerts = get_alerts(username)
    entry = normalize_alert({
        "id": str(uuid.uuid4())[:8], "instrument_id": instrument_id, "direction": direction,
        "metric": metric, "timeframe": timeframe,
        "target_price": target_price, "notes": notes[:500], "support": support, "resistance": resistance,
        "active": True, "created_at": time.time(), "triggered_at": None,
    })
    alerts.append(entry)
    _save(username, alerts)
    return entry


def remove_alert(username: str, alert_id: str) -> bool:
    alerts = get_alerts(username)
    kept = [a for a in alerts if a["id"] != alert_id]
    _save(username, kept)
    return len(kept) != len(alerts)


def update_alert(username: str, alert_id: str, updates: dict) -> dict | None:
    alerts = get_alerts(username)
    for a in alerts:
        if a["id"] == alert_id:
            a.update(updates)
            _save(username, alerts)
            return a
    return None


def get_alert_history(username: str) -> list[dict]:
    """Triggered (inactive) alerts."""
    return [a for a in get_alerts(username) if a.get("triggered_at")]


def crossed(alert: dict, price: float) -> bool:
    return price >= alert["target_price"] if alert["direction"] == "above" else price <= alert["target_price"]


def _fire(username: str, alert: dict, value: float, when: float, candle_time: float | None = None) -> None:
    inst = registry.get(alert["instrument_id"])
    name = inst.name if inst else alert["instrument_id"]
    decimals = inst.price_decimals if inst else 2
    alert["active"] = False
    alert["triggered_at"] = when
    alert["triggered_price"] = value
    if candle_time is not None:
        alert["triggered_candle"] = candle_time
    shown = f"{value:,.{decimals}f}" if alert["metric"] == "price" else f"{value:.1f}"
    target = alert["target_price"]
    level = f"{target:,.{decimals}f}" if alert["metric"] == "price" else f"{target:g}"
    if alert["timeframe"] == LIVE:
        title = f"Price Alert: {name}"
        body = f"{name} is {shown} ({alert['direction']} {level})"
    else:
        tf = CANDLE_NAMES[alert["timeframe"]]
        what = "closed at" if alert["metric"] == "price" else f"{METRICS[alert['metric']]} closed at"
        title = f"{METRICS[alert['metric']].split(' (')[0]} Alert ({tf}): {name}"
        body = f"{name} {tf} candle {what} {shown} ({alert['direction']} {level})"
    add_notification(username, title, body, category="alert")
    _deliver_elsewhere(username, title, body)


def _deliver_elsewhere(username: str, title: str, body: str) -> None:
    """Also send to the user's linked messaging apps (WhatsApp...), when they asked for alerts there."""
    try:
        from services import messaging

        messaging.send_alert(username, title, body)
    except Exception as exc:  # noqa: BLE001 — the in-app notification already went out
        logger.warning("alert delivery failed for %s: %s", username, exc)


async def check_all_alerts():
    """Background task (every minute): live-price alerts against quotes, candle alerts against closes."""
    user_alerts = {}
    live, candle = set(), set()
    for username in users_with(NAMESPACE):
        alerts = get_alerts(username)
        active = [a for a in alerts if a.get("active")]
        if active:
            user_alerts[username] = alerts
            for a in active:
                (live if a["timeframe"] == LIVE else candle).add(
                    a["instrument_id"] if a["timeframe"] == LIVE else (a["instrument_id"], a["timeframe"]))
    if not user_alerts:
        return
    quotes = {}
    if live:
        try:
            quotes = await market.quotes(sorted(live))
        except Exception:  # noqa: BLE001 — try again next minute
            quotes = {}
    closes = await _closed_candles(candle) if candle else {}

    now = time.time()
    for username, alerts in user_alerts.items():
        changed = False
        for alert in alerts:
            if not alert.get("active"):
                continue
            if alert["timeframe"] == LIVE:
                q = quotes.get(alert["instrument_id"])
                # A cached quote from before an outage could fire on an old price: wait for a fresh one
                if q and not q.stale and crossed(alert, q.price):
                    _fire(username, alert, q.price, now)
                    changed = True
                continue
            bars = closes.get((alert["instrument_id"], alert["timeframe"]))
            if not bars:
                continue
            since = max(alert.get("created_at") or 0, alert.get("checked_through") or 0)
            for close_time, values in bars:
                if close_time <= since:
                    continue
                v = values.get(alert["metric"])
                if v is not None and crossed(alert, v):
                    _fire(username, alert, v, now, close_time)
                    break
            if not alert.get("active"):
                changed = True
            elif bars[-1][0] > (alert.get("checked_through") or 0):
                alert["checked_through"] = bars[-1][0]
                changed = True
        if changed:
            _save(username, alerts)


# (instrument, timeframe) -> unix time before which there's no point fetching again
_next_fetch: dict[tuple[str, str], float] = {}
RECHECK_AFTER_CLOSE = 600   # market closed / no new bar yet: look again at most every 10 minutes


async def _closed_candles(groups: set[tuple[str, str]]) -> dict:
    """{(instrument, timeframe): [(close_time, {"price", "rsi", "stoch_k"}), ...]} for recently closed candles.

    A group is fetched only when its forming candle should have closed, so a weekly alert doesn't pull
    candles every minute.
    """
    from services.indicators.oscillators import OscSettings, stoch_rsi

    out = {}
    now = time.time()
    st = OscSettings()
    for iid, tf in sorted(groups):
        if _next_fetch.get((iid, tf), 0) > now:
            continue
        inst = registry.get(iid)
        sessions = inst.sessions if inst else "24/7"
        try:
            rows = await market.candles(iid, tf, st.warmup + 30)
        except Exception as exc:  # noqa: BLE001 — try again next minute
            logger.info("alert candles %s %s failed: %s", iid, tf, exc)
            continue
        if not rows:
            continue
        r, k, _ = stoch_rsi([c.close for c in rows], st)
        closed = []
        for i, c in enumerate(rows):
            close_time = expected_close(c.open_time / 1000, tf, sessions)
            if i < len(rows) - 1:   # a newer candle exists, so this one is complete
                close_time = min(close_time, rows[i + 1].open_time / 1000)
            if close_time <= now:
                closed.append((close_time, {"price": c.close, "rsi": r[i], "stoch_k": k[i]}))
        out[(iid, tf)] = closed[-5:]
        forming_close = expected_close(rows[-1].open_time / 1000, tf, sessions)
        _next_fetch[(iid, tf)] = forming_close if now < forming_close < now + 86400 * 10 else now + RECHECK_AFTER_CLOSE
    return out


_SESSION_HOURS = {"us_equity": 6.5, "index": 6.5, "futures": 23.0, "fx": 24.0}


def expected_close(open_time: float, timeframe: str, sessions: str) -> float:
    """When a candle that opened at `open_time` is complete.

    Intraday candles and anything on a 24/7 market last exactly their size. A daily candle on a
    stock or futures market ends with the session; multi-day candles there span weekends and
    holidays, so they count as complete only once the next candle has started (infinity here).
    """
    bar_s = TIMEFRAMES[timeframe][2]
    if sessions == "24/7" or bar_s < 86400:
        return open_time + bar_s
    if timeframe == "1d":
        return open_time + _SESSION_HOURS.get(sessions, 24.0) * 3600
    return float("inf")
