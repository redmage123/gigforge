"""BACSWN — Carbon Desk trading advisor: rule-based signal engine.

Produces trade *ideas* and a review of the user's open positions from data the
desk already has: 1-minute bars, quotes and depth, the forward curve, market
headlines and the user's CORSIA hedge gap. Every idea is a complete, reviewable
ticket — side, size, limit price, stop, target — with the reasons behind it and
the risks against it. Nothing here places orders; the user does.

This engine always runs. The AI advisor (services/advisor_llm.py) reads its
output and explains, challenges or refines it in conversation.
"""

from __future__ import annotations

import math
from datetime import datetime, timezone

from services.carbon_exchange import CONTRACT_SIZE, MAX_ORDER_QTY, PRODUCTS, TICK

RISK_PER_TRADE = 0.01          # risk 1% of equity between entry and stop
STOP_ATR = 2.0                 # stop distance in ATRs
TARGET_ATR = 3.0               # target distance in ATRs (1.5 : 1 reward/risk)
MIN_SCORE = 0.35               # signal strength needed to suggest a trade
NEWS_WINDOW = 8                # most recent headlines considered
NORMAL_CARRY = 0.06            # contango the curve normally prices per year
DISCLAIMER = ("Simulated market for demonstration — not connected to CME and not financial advice. "
              "Ideas are suggestions; you review and submit every order yourself.")


def _ema(values: list[float], n: int) -> float:
    k, e = 2 / (n + 1), values[0]
    for v in values[1:]:
        e = v * k + e * (1 - k)
    return e


def _atr(bars: list[dict], n: int = 20) -> float:
    rs = [b["h"] - b["l"] for b in bars[-n:]]
    return max(TICK, sum(rs) / len(rs)) if rs else TICK


def _tick(p: float) -> float:
    return round(round(p / TICK) * TICK, 2)


def contract_signals(venue, symbol: str, news: list[dict]) -> dict | None:
    """Technical, news and order-book read for one contract."""
    inst = venue.instruments.get(symbol)
    bars = venue.candles(symbol, minutes=1, limit=240)
    if inst is None or len(bars) < 40:
        return None
    closes = [b["c"] for b in bars]
    last = closes[-1]
    fast, slow = _ema(closes[-60:], 10), _ema(closes[-90:], 30)
    trend = max(-1.0, min(1.0, (fast - slow) / slow / 0.01))         # ±1 at a 1% EMA gap
    mom = (last - closes[-31]) / closes[-31]
    momentum = max(-1.0, min(1.0, mom / 0.02))                        # ±1 at ±2% over 30 bars
    mean60 = sum(closes[-60:]) / 60
    stretch = (last - mean60) / _atr(bars)                            # ATRs away from the hour's mean
    rets = [math.log(closes[i] / closes[i - 1]) for i in range(len(closes) - 60, len(closes))]
    vol = math.sqrt(sum(r * r for r in rets) / len(rets))
    relevant = [n for n in news[:NEWS_WINDOW] if n["product"] in (inst.product, "ALL")]
    sentiment = sum(1 if n["impact"] == "bullish" else -1 for n in relevant) / max(1, len(relevant))
    d = inst.depth(5)
    bid_sz, ask_sz = sum(x["size"] for x in d["bids"]), sum(x["size"] for x in d["asks"])
    imbalance = (bid_sz - ask_sz) / max(1, bid_sz + ask_sz)
    # Trend and momentum lead; news confirms; a stretched market argues against chasing.
    score = 0.45 * trend + 0.3 * momentum + 0.25 * sentiment - 0.15 * max(-2.0, min(2.0, stretch)) / 2
    return {
        "symbol": symbol, "product": inst.product, "month": inst.month_label,
        "last": round(last, 2), "bid": inst.best_bid() and round(inst.best_bid() * TICK, 2),
        "ask": inst.best_ask() and round(inst.best_ask() * TICK, 2),
        "atr": round(_atr(bars), 4), "trend": round(trend, 2), "momentum": round(momentum, 2),
        "stretch_atr": round(stretch, 2), "volatility_per_min": round(vol, 5),
        "news_sentiment": round(sentiment, 2), "news": [n["headline"] for n in relevant[:3]],
        "book_imbalance": round(imbalance, 2), "score": round(score, 2),
    }


def curve(venue) -> list[dict]:
    """Carry between consecutive listed months, per product, against the normal contango."""
    out = []
    for product in PRODUCTS:
        insts = sorted((i for i in venue.instruments.values() if i.product == product), key=lambda i: (i.year, i.month))
        for a, b in zip(insts, insts[1:]):
            pa, pb = a.mark(), b.mark()
            yrs = max(0.08, b.years_to_expiry - a.years_to_expiry)
            carry = (pb - pa) / pa / yrs
            out.append({"product": product, "front": a.symbol, "back": b.symbol, "spread": round(pb - pa, 2),
                        "carry_per_year": round(carry, 3), "normal": NORMAL_CARRY,
                        "anomaly": abs(carry - NORMAL_CARRY) > 0.08})
    return out


def _size(equity: float, buying_power: float, stop_dist: float, margin: float) -> int:
    by_risk = int(equity * RISK_PER_TRADE / max(stop_dist * CONTRACT_SIZE, 1e-9))
    by_margin = int(max(0.0, buying_power) * 0.5 / margin)        # never use more than half of what's free
    return max(0, min(MAX_ORDER_QTY, by_risk, by_margin))


def _signal_list(sig: dict, always: set[str], extra: int = 4) -> list[dict]:
    """Every front month and held contract, plus the strongest other signals."""
    first = [sig[s] for s in sorted(always) if s in sig]
    rest = sorted((v for k, v in sig.items() if k not in always), key=lambda v: -abs(v["score"]))[:extra]
    return first + rest


def ideas(venue, account: dict, obligation: dict | None = None) -> dict:
    """Trade ideas, position review and a market read for one account."""
    snap = venue.market_snapshot(depth_levels=1)
    news = snap["news"]
    fronts = {}
    for q in snap["quotes"]:
        fronts.setdefault(q["product"], q["symbol"])                 # quotes are listed front month first
    sig = {s: contract_signals(venue, s, news) for s in venue.instruments}
    sig = {k: v for k, v in sig.items() if v}
    equity, bp = account["equity"], account["buying_power"]
    held = {p["symbol"]: p for p in account["positions"] if p["qty"]}
    out: list[dict] = []

    def ticket(kind, s, side, headline, reasons, risks, conf, qty=None, entry=None):
        inst = venue.instruments[s["symbol"]]
        entry = entry if entry is not None else (s["bid"] if side == "BUY" else s["ask"]) or s["last"]
        stop_dist = STOP_ATR * s["atr"]
        sign = 1 if side == "BUY" else -1
        q = qty if qty is not None else _size(equity, bp, stop_dist, inst.spec["initial_margin"])
        if q <= 0:
            return
        if kind == "hedge":
            # A hedge is held to cover the obligation, not traded out of: no stop or target.
            stop = target = None
            risk, reward = q * CONTRACT_SIZE * s["atr"], None
        else:
            stop, target = _tick(entry - sign * stop_dist), _tick(entry + sign * TARGET_ATR * s["atr"])
            risk, reward = abs(entry - stop) * q * CONTRACT_SIZE, abs(target - entry) * q * CONTRACT_SIZE
        out.append({
            "id": f"{kind}-{s['symbol']}-{side}", "kind": kind, "symbol": s["symbol"], "side": side, "qty": q,
            "order": {"type": "LMT", "price": _tick(entry), "tif": "DAY"}, "stop": stop, "target": target,
            "risk_usd": round(risk, 2), "reward_usd": reward and round(reward, 2),
            "risk_basis": "value change for a one-ATR move" if kind == "hedge" else "loss if the stop is hit",
            "margin_usd": round(q * inst.spec["initial_margin"], 2),
            "confidence": round(max(0.05, min(0.95, conf)), 2),
            "headline": headline, "reasons": reasons, "risks": risks,
        })

    # 1. Tactical: strongest signal per product, front month (most liquid).
    for product, sym in fronts.items():
        s = sig.get(sym)
        if not s or abs(s["score"]) < MIN_SCORE or sym in held:
            continue
        side = "BUY" if s["score"] > 0 else "SELL"
        word = "Long" if side == "BUY" else "Short"
        reasons = [f"Trend {'up' if s['trend'] > 0 else 'down'} ({s['trend']:+.2f}): the 10-bar average is "
                   f"{'above' if s['trend'] > 0 else 'below'} the 30-bar average",
                   f"Momentum {s['momentum']:+.2f} over the last 30 minutes"]
        if s["news_sentiment"] and (s["news_sentiment"] > 0) == (side == "BUY"):
            reasons.append(f"Headlines lean {'bullish' if s['news_sentiment'] > 0 else 'bearish'}: {s['news'][0]}")
        if (s["book_imbalance"] > 0.15) == (side == "BUY") and abs(s["book_imbalance"]) > 0.15:
            reasons.append(f"Order book {'bid' if s['book_imbalance'] > 0 else 'offer'}-heavy ({s['book_imbalance']:+.2f})")
        risks = [f"Stop at {STOP_ATR:g} ATR — the trade is wrong if price gets there"]
        if abs(s["stretch_atr"]) > 1.5 and (s["stretch_atr"] > 0) == (side == "BUY"):
            risks.append(f"Price already {abs(s['stretch_atr']):.1f} ATR from its hourly mean — chasing risk")
        if s["news_sentiment"] and (s["news_sentiment"] > 0) != (side == "BUY"):
            risks.append(f"Headlines lean the other way: {s['news'][0]}")
        ticket("tactical", s, side, f"{word} {s['symbol']} — {PRODUCTS[product]['name'].split(' ', 1)[1]}",
               reasons, risks, abs(s["score"]))

    # 2. Strategic: close the CORSIA hedge gap with the CORSIA-eligible GEO front month.
    if obligation and obligation.get("contracts_to_hedge", 0) > 0 and fronts.get("GEO") in sig:
        s = sig[fronts["GEO"]]
        need = min(MAX_ORDER_QTY, obligation["contracts_to_hedge"])
        reasons = [f"Hedge covers {obligation['coverage_pct']}% of the estimated "
                   f"{obligation['required_offsets']:,} offsets CORSIA will require",
                   "GEO is the CORSIA-eligible contract; buying it fixes the cost of the obligation now"]
        risks = ["Locks in today's price: if offsets get cheaper, the hedge loses value",
                 "The obligation is an estimate from current traffic, not reported fuel burn"]
        if s["trend"] < -0.3:
            risks.append("Short-term trend is down — consider buying in tranches")
        ticket("hedge", s, "BUY", f"Hedge CORSIA exposure — buy {need} {s['symbol']}", reasons, risks, 0.7, qty=need,
               entry=s["ask"] or s["last"])

    # 3. Curve: carry far from normal is reported for context. Deferred months trade
    #    thinly in the simulation, so these are not turned into spread trades.
    spreads = [c for c in curve(venue) if c["anomaly"]]

    # Position review.
    review = []
    for sym, p in held.items():
        s = sig.get(sym)
        if not s:
            continue
        atr_pnl = (s["last"] - p["avg_price"]) / s["atr"] * (1 if p["qty"] > 0 else -1)
        against = (s["score"] < -MIN_SCORE and p["qty"] > 0) or (s["score"] > MIN_SCORE and p["qty"] < 0)
        if atr_pnl <= -STOP_ATR:
            action, why = "cut", f"Down {abs(atr_pnl):.1f} ATR — beyond where a {STOP_ATR:g}-ATR stop would sit"
        elif atr_pnl >= TARGET_ATR:
            action, why = "take_profit", f"Up {atr_pnl:.1f} ATR — at the usual target; consider taking half off"
        elif against:
            action, why = "tighten", "Signals have turned against the position — consider tightening the stop"
        else:
            action, why = "hold", "Within normal range and signals still agree"
        review.append({"symbol": sym, "qty": p["qty"], "avg_price": p["avg_price"], "mark": p["mark"],
                       "unrealized_pnl": p["unrealized_pnl"], "pnl_atr": round(atr_pnl, 1),
                       "action": action, "why": why})
    margin_pct = account["margin_used"] / equity * 100 if equity else 0
    portfolio = {"equity": equity, "buying_power": bp, "margin_used_pct": round(margin_pct, 1),
                 "warning": "Margin use above 50% of equity — new positions limited" if margin_pct > 50 else None}

    out.sort(key=lambda i: (i["kind"] != "hedge", -i["confidence"]))
    return {"time": datetime.now(timezone.utc).isoformat(), "ideas": out, "review": review,
            "portfolio": portfolio, "signals": _signal_list(sig, set(fronts.values()) | set(held)),
            "curve_anomalies": spreads, "obligation": obligation,
            "method": f"Risk {RISK_PER_TRADE:.0%} of equity per idea; stop {STOP_ATR:g} ATR, target {TARGET_ATR:g} ATR; "
                      "signals from 10/30-bar EMA trend, 30-bar momentum, headlines, order-book imbalance.",
            "disclaimer": DISCLAIMER}
