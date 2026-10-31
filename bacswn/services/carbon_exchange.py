"""BACSWN — Simulated carbon-offset futures exchange (CME GEO / N-GEO / C-GEO).

A self-contained, in-process exchange used for demos. It mirrors the contract
specs of CME Group's CBL emissions-offset futures (1,000 offsets per contract,
$0.01 tick = $10) but is NOT connected to CME Group. Prices are synthetic.

Pieces:
  * Central limit order book per instrument with price-time priority matching.
  * Order types MKT / LMT / STP (stop-market) / STL (stop-limit);
    TIF DAY / GTC / IOC / FOK.
  * Simulated market makers (quote ladders around a fair value) and noise
    takers so the book trades on its own.
  * Per-user accounts: cash, positions, realized/unrealized P&L, fees,
    initial-margin pre-trade risk checks, CME-style price banding.

Going live means replacing `SimulatedVenue` with an adapter for a broker or FCM
that has CME Globex order entry (iLink 3 / Globex order-entry web APIs); the
`TradingVenue` protocol is the seam.

The engine runs in memory. User state (accounts, positions, orders, fills) and
the market (spot levels, instrument stats, 1-minute bars) are written behind to
SQLite by `services/trading_store.py` and restored on startup: see
`export_changes()` / `restore()`.
"""

from __future__ import annotations

import itertools
import math
import random
import time
from collections import deque
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from typing import Protocol

# ── Contract specifications ─────────────────────────────────────────────
CONTRACT_SIZE = 1000          # offsets (1 offset = 1 tCO2e) per contract
TICK = 0.01                   # USD per offset
TICK_VALUE = CONTRACT_SIZE * TICK   # $10 per tick per contract
FEE_PER_CONTRACT = 1.85       # simulated exchange + clearing + NFA, per side
STARTING_CASH = 1_000_000.0
MAX_ORDER_QTY = 500
PRICE_BAND_PCT = 0.20         # reject limit/stop prices >20% from reference

PRODUCTS = {
    "GEO": {
        "name": "CBL Global Emissions Offset",
        "description": "CORSIA-eligible offsets (Verra, ACR, CAR)",
        "anchor": 1.18, "vol": 0.55, "initial_margin": 420.0, "corsia_eligible": True,
    },
    "NGO": {
        "name": "CBL Nature-Based Global Emissions Offset",
        "description": "Verra VCS AFOLU nature-based offsets",
        "anchor": 1.42, "vol": 0.60, "initial_margin": 480.0, "corsia_eligible": False,
    },
    "CGO": {
        "name": "CBL Core Global Emissions Offset",
        "description": "Energy & technology-based Verra offsets",
        "anchor": 0.46, "vol": 0.70, "initial_margin": 190.0, "corsia_eligible": False,
    },
}

MONTH_CODES = "FGHJKMNQUVXZ"
QUARTERLY_MONTHS = (3, 6, 9, 12)
CONTANGO_PER_YEAR = 0.06      # deferred contracts trade at a carry premium

NEWS_EVENTS = [
    ("ICAO CAEP confirms additional CORSIA-eligible programmes for Phase 2", "GEO", +0.04),
    ("Verra flags reversal risk review on legacy REDD+ vintages", "NGO", -0.05),
    ("Large airline group announces forward offset procurement programme", "GEO", +0.03),
    ("Registry backlog delays issuance of 2025 cookstove vintages", "CGO", +0.03),
    ("Integrity Council (ICVCM) CCP label granted to new methodology", "NGO", +0.04),
    ("Hedge fund liquidation pressures deferred offset futures", None, -0.03),
    ("EU announces review of international credit use toward 2040 target", None, +0.02),
    ("Bahamas FIR traffic up 9% y/y — CORSIA demand outlook raised", "GEO", +0.02),
]


def _listed_expiries(today: date | None = None, count: int = 4) -> list[tuple[int, int]]:
    """Next `count` quarterly contract months strictly after the current month."""
    today = today or datetime.now(timezone.utc).date()
    y, m = today.year, today.month
    out = []
    while len(out) < count:
        m += 1
        if m > 12:
            y, m = y + 1, 1
        if m in QUARTERLY_MONTHS:
            out.append((y, m))
    return out


def _to_ticks(price: float) -> int:
    return int(round(price / TICK))


def _px(ticks: int) -> float:
    return round(ticks * TICK, 2)


# ── Core data types ─────────────────────────────────────────────────────
_order_ids = itertools.count(1)
_trade_ids = itertools.count(1)


@dataclass
class Order:
    id: int
    owner: str               # username, or "@mm"/"@flow" for simulated participants
    symbol: str
    side: str                # BUY / SELL
    qty: int
    type: str                # MKT / LMT / STP / STL
    tif: str                 # DAY / GTC / IOC / FOK
    price: int | None = None     # limit price in ticks
    stop: int | None = None      # stop trigger in ticks
    filled: int = 0
    avg_fill: float = 0.0
    status: str = "WORKING"      # WORKING / PENDING / PARTIAL / FILLED / CANCELLED / REJECTED
    reason: str = ""
    created: float = field(default_factory=time.time)
    updated: float = field(default_factory=time.time)

    @property
    def remaining(self) -> int:
        return self.qty - self.filled

    @property
    def is_sim(self) -> bool:
        return self.owner.startswith("@")

    def to_dict(self) -> dict:
        return {
            "id": self.id, "symbol": self.symbol, "side": self.side, "qty": self.qty,
            "type": self.type, "tif": self.tif,
            "price": _px(self.price) if self.price is not None else None,
            "stop": _px(self.stop) if self.stop is not None else None,
            "filled": self.filled, "remaining": self.remaining,
            "avg_fill": round(self.avg_fill, 4) if self.filled else None,
            "status": self.status, "reason": self.reason,
            "created": datetime.fromtimestamp(self.created, timezone.utc).isoformat(),
            "updated": datetime.fromtimestamp(self.updated, timezone.utc).isoformat(),
        }


@dataclass
class Instrument:
    symbol: str
    product: str
    year: int
    month: int
    fair: float
    settle: float                # prior-day settlement
    bids: dict[int, deque] = field(default_factory=dict)
    asks: dict[int, deque] = field(default_factory=dict)
    stops: list[Order] = field(default_factory=list)
    last: float | None = None
    last_size: int = 0
    open: float | None = None
    high: float | None = None
    low: float | None = None
    volume: int = 0
    open_interest: int = 0
    candles: list[dict] = field(default_factory=list)     # 1-minute bars
    tape: deque = field(default_factory=lambda: deque(maxlen=200))

    @property
    def spec(self) -> dict:
        return PRODUCTS[self.product]

    @property
    def month_label(self) -> str:
        return date(self.year, self.month, 1).strftime("%b%y").upper()

    @property
    def years_to_expiry(self) -> float:
        exp = date(self.year, self.month, 28)
        return max(0.0, (exp - datetime.now(timezone.utc).date()).days / 365.0)

    def best_bid(self) -> int | None:
        return max(self.bids) if self.bids else None

    def best_ask(self) -> int | None:
        return min(self.asks) if self.asks else None

    def mid(self) -> float:
        b, a = self.best_bid(), self.best_ask()
        if b is not None and a is not None:
            return (b + a) * TICK / 2
        return self.last if self.last is not None else self.fair

    def mark(self) -> float:
        return self.last if self.last is not None else self.mid()

    def depth(self, levels: int = 10) -> dict:
        def side(book, keys):
            out = []
            for p in keys[:levels]:
                q = book[p]
                out.append({"price": _px(p), "size": sum(o.remaining for o in q), "orders": len(q)})
            return out
        return {
            "bids": side(self.bids, sorted(self.bids, reverse=True)),
            "asks": side(self.asks, sorted(self.asks)),
        }

    def quote(self) -> dict:
        b, a = self.best_bid(), self.best_ask()
        bsz = sum(o.remaining for o in self.bids[b]) if b is not None else 0
        asz = sum(o.remaining for o in self.asks[a]) if a is not None else 0
        last = self.last if self.last is not None else self.settle
        chg = last - self.settle
        return {
            "symbol": self.symbol, "product": self.product, "month": self.month_label,
            "name": self.spec["name"], "corsia_eligible": self.spec["corsia_eligible"],
            "bid": _px(b) if b is not None else None, "bid_size": bsz,
            "ask": _px(a) if a is not None else None, "ask_size": asz,
            "last": round(last, 2), "last_size": self.last_size,
            "change": round(chg, 2), "change_pct": round(chg / self.settle * 100, 2) if self.settle else 0,
            "open": self.open, "high": self.high, "low": self.low,
            "settle": round(self.settle, 2), "volume": self.volume, "open_interest": self.open_interest,
            "initial_margin": self.spec["initial_margin"],
        }


@dataclass
class Position:
    qty: int = 0
    avg_price: float = 0.0
    realized: float = 0.0


@dataclass
class Account:
    owner: str
    cash: float = STARTING_CASH
    fees: float = 0.0
    positions: dict[str, Position] = field(default_factory=dict)
    orders: dict[int, Order] = field(default_factory=dict)
    fills: deque = field(default_factory=lambda: deque(maxlen=300))
    start_equity: float = STARTING_CASH
    unsaved_fills: list = field(default_factory=list)   # not yet written to the store


class TradingVenue(Protocol):
    """Seam for swapping the simulator for a real broker/FCM connection."""

    def submit(self, owner: str, **order) -> dict: ...
    def cancel(self, owner: str, order_id: int) -> dict: ...
    def account(self, owner: str) -> dict: ...
    def market_snapshot(self) -> dict: ...


# ── The exchange ────────────────────────────────────────────────────────
class SimulatedVenue:
    venue_name = "SIM-GLOBEX"

    def __init__(self, seed: int | None = None):
        self.rng = random.Random(seed)
        self.instruments: dict[str, Instrument] = {}
        self.accounts: dict[str, Account] = {}
        self.news: deque = deque(maxlen=30)
        self._spot = {p: s["anchor"] * (1 + self.rng.gauss(0, 0.03)) for p, s in PRODUCTS.items()}
        self._last_step = time.time()
        self._front = _listed_expiries()[0]
        self._dirty: set[str] = set()            # accounts changed since the last export
        self._saved_orders: dict[int, tuple] = {}  # last row written per user order
        self._candle_mark: dict[str, int] = {}   # newest bar time already exported
        self._list_instruments()

    # ── setup ──
    def _list_instruments(self) -> None:
        for product in PRODUCTS:
            for (y, m) in _listed_expiries():
                sym = f"{product}{MONTH_CODES[m - 1]}{y % 10}"
                inst = Instrument(symbol=sym, product=product, year=y, month=m, fair=0, settle=0)
                inst.fair = self._fair(inst)
                inst.open_interest = self.rng.randint(800, 9000) // (1 + len(self.instruments) % 4)
                self._seed_history(inst)
                self.instruments[sym] = inst
                self._requote(inst)

    def _fair(self, inst: Instrument) -> float:
        return self._spot[inst.product] * (1 + CONTANGO_PER_YEAR * inst.years_to_expiry)

    def _seed_history(self, inst: Instrument, bars: int = 240) -> None:
        """Synthetic 1-minute history ending at the current fair value.

        Uses the same time compression as `step()` (~1 trading day per 10 minutes)
        so the seeded bars look like the live ones that follow them.
        """
        vol_per_min = inst.spec["vol"] / math.sqrt(252) * math.sqrt(60 / 600)
        prices = [inst.fair]
        for _ in range(bars):
            prices.append(max(0.05, prices[-1] * math.exp(self.rng.gauss(0, vol_per_min))))
        prices.reverse()
        now_min = int(time.time() // 60) * 60
        for i, close in enumerate(prices[1:]):
            o = prices[i]
            hi = max(o, close) * (1 + abs(self.rng.gauss(0, vol_per_min)))
            lo = min(o, close) * (1 - abs(self.rng.gauss(0, vol_per_min)))
            inst.candles.append({
                "t": now_min - (bars - i) * 60, "o": round(o, 2), "h": round(hi, 2),
                "l": round(lo, 2), "c": round(close, 2), "v": self.rng.randint(5, 120),
            })
        inst.settle = inst.candles[0]["o"]
        inst.open = inst.candles[0]["o"]
        inst.high = max(c["h"] for c in inst.candles)
        inst.low = min(c["l"] for c in inst.candles)
        inst.last = inst.candles[-1]["c"]
        inst.volume = sum(c["v"] for c in inst.candles)

    def account_for(self, owner: str) -> Account:
        if owner not in self.accounts:
            self.accounts[owner] = Account(owner=owner)
            self._dirty.add(owner)
        return self.accounts[owner]

    # ── order entry ──
    def submit(self, owner: str, symbol: str, side: str, qty: int, type: str = "LMT",
               tif: str = "DAY", price: float | None = None, stop: float | None = None) -> dict:
        side, type, tif = side.upper(), type.upper(), tif.upper()
        inst = self.instruments.get(symbol)
        order = Order(id=next(_order_ids), owner=owner, symbol=symbol, side=side, qty=int(qty),
                      type=type, tif=tif,
                      price=_to_ticks(price) if price is not None else None,
                      stop=_to_ticks(stop) if stop is not None else None)
        acct = None if order.is_sim else self.account_for(owner)
        if acct is not None:
            acct.orders[order.id] = order
            self._dirty.add(owner)

        reject = self._validate(order, inst, acct)
        if reject:
            order.status, order.reason = "REJECTED", reject
            return order.to_dict()

        if type in ("STP", "STL"):
            order.status = "PENDING"
            inst.stops.append(order)
            return order.to_dict()

        self._execute(inst, order)
        return order.to_dict()

    def _validate(self, o: Order, inst: Instrument | None, acct: Account | None) -> str:
        if inst is None:
            return f"Unknown instrument {o.symbol}"
        if o.side not in ("BUY", "SELL"):
            return "Side must be BUY or SELL"
        if o.type not in ("MKT", "LMT", "STP", "STL"):
            return "Order type must be MKT, LMT, STP or STL"
        if o.tif not in ("DAY", "GTC", "IOC", "FOK"):
            return "TIF must be DAY, GTC, IOC or FOK"
        if not 1 <= o.qty <= MAX_ORDER_QTY:
            return f"Quantity must be 1–{MAX_ORDER_QTY} contracts"
        if o.type in ("LMT", "STL") and (o.price is None or o.price <= 0):
            return "Limit price required"
        if o.type in ("STP", "STL") and (o.stop is None or o.stop <= 0):
            return "Stop price required"
        if o.type in ("STP", "STL") and o.tif in ("IOC", "FOK"):
            return "Stop orders cannot be IOC/FOK"
        ref = inst.mark()
        for label, ticks in (("Limit", o.price), ("Stop", o.stop)):
            if ticks is not None and abs(_px(ticks) - ref) > ref * PRICE_BAND_PCT:
                return f"{label} price outside price band (±{int(PRICE_BAND_PCT * 100)}% of {ref:.2f})"
        if o.type in ("STP", "STL"):
            last_t = _to_ticks(ref)
            if o.side == "BUY" and o.stop <= last_t:
                return "Buy stop must be above the last price"
            if o.side == "SELL" and o.stop >= last_t:
                return "Sell stop must be below the last price"
        if acct is not None:
            pos = acct.positions.get(o.symbol, Position())
            new_qty = pos.qty + (o.qty if o.side == "BUY" else -o.qty)
            added = max(0, abs(new_qty) - abs(pos.qty))
            need = added * inst.spec["initial_margin"]
            snap = self._account_metrics(acct)
            if need > snap["buying_power"]:
                return f"Insufficient buying power: need ${need:,.0f}, have ${snap['buying_power']:,.0f}"
        return ""

    def cancel(self, owner: str, order_id: int) -> dict:
        acct = self.account_for(owner)
        o = acct.orders.get(order_id)
        if o is None:
            return {"error": "Order not found"}
        if o.status not in ("WORKING", "PARTIAL", "PENDING"):
            return {"error": f"Order is {o.status}"}
        self._remove_resting(o)
        o.status, o.updated = "CANCELLED", time.time()
        self._dirty.add(owner)
        return o.to_dict()

    def cancel_all(self, owner: str, symbol: str | None = None) -> int:
        acct = self.account_for(owner)
        n = 0
        for o in list(acct.orders.values()):
            if o.status in ("WORKING", "PARTIAL", "PENDING") and (symbol is None or o.symbol == symbol):
                self.cancel(owner, o.id)
                n += 1
        return n

    def flatten(self, owner: str, symbol: str) -> dict:
        """Cancel working orders and close the position at market."""
        self.cancel_all(owner, symbol)
        pos = self.account_for(owner).positions.get(symbol)
        if not pos or pos.qty == 0:
            return {"error": "No position"}
        return self.submit(owner, symbol, "SELL" if pos.qty > 0 else "BUY", abs(pos.qty), "MKT", "IOC")

    # ── matching ──
    def _remove_resting(self, o: Order) -> None:
        inst = self.instruments[o.symbol]
        if o in inst.stops:
            inst.stops.remove(o)
            return
        book = inst.bids if o.side == "BUY" else inst.asks
        if o.price in book and o in book[o.price]:
            book[o.price].remove(o)
            if not book[o.price]:
                del book[o.price]

    def _available(self, inst: Instrument, o: Order) -> int:
        book = inst.asks if o.side == "BUY" else inst.bids
        total = 0
        for p, q in book.items():
            if o.price is None or (p <= o.price if o.side == "BUY" else p >= o.price):
                total += sum(x.remaining for x in q)
        return total

    def _execute(self, inst: Instrument, o: Order) -> None:
        if o.tif == "FOK" and self._available(inst, o) < o.qty:
            o.status, o.reason = "CANCELLED", "FOK: insufficient liquidity"
            return
        opp = inst.asks if o.side == "BUY" else inst.bids
        while o.remaining > 0 and opp:
            best = min(opp) if o.side == "BUY" else max(opp)
            if o.type in ("LMT", "STL") and (best > o.price if o.side == "BUY" else best < o.price):
                break
            queue = opp[best]
            while o.remaining > 0 and queue:
                resting = queue[0]
                qty = min(o.remaining, resting.remaining)
                self._fill(inst, o, resting, qty, best)
                if resting.remaining == 0:
                    queue.popleft()
            if not queue:
                del opp[best]

        if o.remaining == 0:
            o.status = "FILLED"
        elif o.type in ("MKT", "STP") or o.tif in ("IOC", "FOK"):
            # Market and immediate orders never rest: cancel whatever is left.
            o.status = "CANCELLED"
            o.reason = "Remainder cancelled (no liquidity)" if o.filled else "No liquidity"
        else:
            o.status = "PARTIAL" if o.filled else "WORKING"
            book = inst.bids if o.side == "BUY" else inst.asks
            book.setdefault(o.price, deque()).append(o)
        o.updated = time.time()
        # Only after the sweep is done: stops elected by these trades re-enter
        # matching without mutating the book we were iterating.
        self._trigger_stops(inst)

    def _fill(self, inst: Instrument, taker: Order, maker: Order, qty: int, ticks: int) -> None:
        price = _px(ticks)
        for o in (taker, maker):
            o.avg_fill = (o.avg_fill * o.filled + price * qty) / (o.filled + qty)
            o.filled += qty
            o.updated = time.time()
            if o is maker:
                o.status = "FILLED" if o.remaining == 0 else "PARTIAL"
            if not o.is_sim:
                self._book_fill(o, inst, qty, price, liquidity="ADD" if o is maker else "REMOVE")

        trade = {
            "id": next(_trade_ids), "symbol": inst.symbol, "price": price, "qty": qty,
            "aggressor": taker.side, "time": datetime.now(timezone.utc).isoformat(),
        }
        inst.tape.appendleft(trade)
        inst.last, inst.last_size = price, qty
        inst.volume += qty
        inst.open = inst.open if inst.open is not None else price
        inst.high = price if inst.high is None else max(inst.high, price)
        inst.low = price if inst.low is None else min(inst.low, price)
        inst.open_interest = max(0, inst.open_interest + self.rng.choice((-1, 0, 1)) * qty)
        self._update_candle(inst, price, qty)

    def _book_fill(self, o: Order, inst: Instrument, qty: int, price: float, liquidity: str) -> None:
        acct = self.account_for(o.owner)
        self._dirty.add(o.owner)
        pos = acct.positions.setdefault(o.symbol, Position())
        signed = qty if o.side == "BUY" else -qty
        if pos.qty == 0 or (pos.qty > 0) == (signed > 0):
            total = pos.qty + signed
            pos.avg_price = (pos.avg_price * abs(pos.qty) + price * qty) / abs(total)
            pos.qty = total
        else:
            closing = min(qty, abs(pos.qty))
            direction = 1 if pos.qty > 0 else -1
            pnl = (price - pos.avg_price) * closing * CONTRACT_SIZE * direction
            pos.realized += pnl
            acct.cash += pnl
            pos.qty += signed
            if pos.qty == 0:
                pos.avg_price = 0.0
            elif (pos.qty > 0) != (direction > 0):
                pos.avg_price = price          # flipped through flat
        fee = FEE_PER_CONTRACT * qty
        acct.fees += fee
        acct.cash -= fee
        fill = {
            "order_id": o.id, "symbol": o.symbol, "side": o.side, "qty": qty, "price": price,
            "fee": round(fee, 2), "liquidity": liquidity,
            "time": datetime.now(timezone.utc).isoformat(),
        }
        acct.fills.appendleft(fill)
        acct.unsaved_fills.append(fill)

    def _trigger_stops(self, inst: Instrument) -> None:
        if inst.last is None or not inst.stops:
            return
        last_t = _to_ticks(inst.last)
        fired = [o for o in inst.stops
                 if (o.side == "BUY" and last_t >= o.stop) or (o.side == "SELL" and last_t <= o.stop)]
        for o in fired:
            inst.stops.remove(o)
            if not o.is_sim:
                self._dirty.add(o.owner)
            o.type = "MKT" if o.type == "STP" else "LMT"
            o.status = "WORKING"
            o.reason = "Stop triggered"
            self._execute(inst, o)

    def _update_candle(self, inst: Instrument, price: float, qty: int) -> None:
        t = int(time.time() // 60) * 60
        c = inst.candles[-1] if inst.candles else None
        if c is None or c["t"] < t:
            o = c["c"] if c else price
            inst.candles.append({"t": t, "o": o, "h": max(o, price), "l": min(o, price), "c": price, "v": qty})
            if len(inst.candles) > 1500:
                del inst.candles[:-1500]
        else:
            c["h"], c["l"] = max(c["h"], price), min(c["l"], price)
            c["c"] = price
            c["v"] += qty

    # ── simulated market ──
    def step(self) -> None:
        """Advance the simulated market: move fair values, re-quote, generate flow."""
        now = time.time()
        dt = min(5.0, max(0.05, now - self._last_step))
        self._last_step = now

        for product, spec in PRODUCTS.items():
            # Mean-reverting log random walk, time-compressed (~1 trading day per 10 min).
            sigma = spec["vol"] / math.sqrt(252) * math.sqrt(dt / 600)
            pull = 0.002 * dt * math.log(spec["anchor"] / self._spot[product])
            self._spot[product] *= math.exp(pull + self.rng.gauss(0, sigma))

        if self.rng.random() < dt / 45:
            headline, product, shock = self.rng.choice(NEWS_EVENTS)
            for p in ([product] if product else list(PRODUCTS)):
                self._spot[p] *= 1 + shock * self.rng.uniform(0.5, 1.2)
            self.news.appendleft({"time": datetime.now(timezone.utc).isoformat(),
                                  "headline": headline, "product": product or "ALL",
                                  "impact": "bullish" if shock > 0 else "bearish"})

        for inst in self.instruments.values():
            inst.fair = self._fair(inst)
            self._requote(inst)
            self._noise_flow(inst, dt)

    def _requote(self, inst: Instrument) -> None:
        # Pull previous market-maker quotes (resting user orders keep queue priority).
        for book in (inst.bids, inst.asks):
            for p in list(book):
                q = deque(o for o in book[p] if o.owner != "@mm")
                if q:
                    book[p] = q
                else:
                    del book[p]
        fair_t = _to_ticks(inst.fair)
        half = self.rng.choice((1, 1, 1, 2))
        liquidity = 1.0 if (inst.year, inst.month) == self._front else 0.55
        for lvl in range(10):
            size = max(1, int(self.rng.randint(4, 30) * (1 + lvl * 0.35) * liquidity))
            for side, p in (("BUY", fair_t - half - lvl), ("SELL", fair_t + half + lvl)):
                if p <= 0:
                    continue
                o = Order(id=next(_order_ids), owner="@mm", symbol=inst.symbol, side=side,
                          qty=size, type="LMT", tif="DAY", price=p)
                # Don't cross resting user orders — trade against them instead.
                self._execute(inst, o)

    def _noise_flow(self, inst: Instrument, dt: float) -> None:
        rate = (1.4 if (inst.year, inst.month) == self._front else 0.35) * dt
        for _ in range(self._poisson(rate)):
            drift = (inst.fair - inst.mid()) / max(inst.fair, 0.01)
            p_buy = min(0.85, max(0.15, 0.5 + drift * 25))
            side = "BUY" if self.rng.random() < p_buy else "SELL"
            qty = max(1, int(self.rng.expovariate(1 / 6)))
            self.submit("@flow", inst.symbol, side, min(qty, 60), "MKT", "IOC")

    def _poisson(self, lam: float) -> int:
        n, p, threshold = 0, 1.0, math.exp(-lam)
        while True:
            p *= self.rng.random()
            if p <= threshold:
                return n
            n += 1

    # ── persistence (see services/trading_store.py) ──
    @staticmethod
    def _order_row(o: Order) -> tuple:
        return (o.id, o.owner, o.symbol, o.side, o.qty, o.type, o.tif, o.price, o.stop,
                o.filled, o.avg_fill, o.status, o.reason, o.created, o.updated)

    def export_changes(self, market: bool = False) -> dict:
        """Everything changed since the last export, as plain rows; clears the dirty marks.

        Hand the result to `requeue()` if writing it fails, so nothing is lost.
        """
        batch: dict = {"accounts": [], "positions": {}, "orders": [], "fills": [], "owners": []}
        for owner in sorted(self._dirty):
            acct = self.accounts.get(owner)
            if acct is None:
                continue
            batch["owners"].append(owner)
            batch["accounts"].append((owner, acct.cash, acct.fees, acct.start_equity))
            batch["positions"][owner] = [(owner, sym, p.qty, p.avg_price, p.realized)
                                         for sym, p in acct.positions.items()]
            for o in acct.orders.values():
                row = self._order_row(o)
                if self._saved_orders.get(o.id) != row:
                    batch["orders"].append(row)
                    self._saved_orders[o.id] = row
            batch["fills"] += [(owner, f["order_id"], f["symbol"], f["side"], f["qty"], f["price"],
                                f["fee"], f["liquidity"], f["time"]) for f in acct.unsaved_fills]
            acct.unsaved_fills = []
        self._dirty.clear()
        if market:
            batch["spot"] = list(self._spot.items())
            batch["instruments"] = [(i.symbol, i.settle, i.open, i.high, i.low, i.last, i.last_size,
                                     i.volume, i.open_interest) for i in self.instruments.values()]
            batch["candles"] = []
            batch["candle_marks"] = dict(self._candle_mark)
            for sym, inst in self.instruments.items():
                mark = self._candle_mark.get(sym, 0)
                new = [c for c in inst.candles if c["t"] >= mark]
                batch["candles"] += [(sym, c["t"], c["o"], c["h"], c["l"], c["c"], c["v"]) for c in new]
                if inst.candles:
                    self._candle_mark[sym] = inst.candles[-1]["t"]
        return batch

    def requeue(self, batch: dict) -> None:
        """Undo an export whose write failed: the next export will include it again."""
        self._dirty.update(batch["owners"])
        for row in batch["orders"]:
            self._saved_orders.pop(row[0], None)
        by_owner: dict[str, list] = {}
        for owner, order_id, sym, side, qty, price, fee, liq, t in batch["fills"]:
            by_owner.setdefault(owner, []).append({"order_id": order_id, "symbol": sym, "side": side, "qty": qty,
                                                   "price": price, "fee": fee, "liquidity": liq, "time": t})
        for owner, fills in by_owner.items():
            acct = self.accounts.get(owner)
            if acct is not None:
                acct.unsaved_fills = fills + acct.unsaved_fills
        if "candle_marks" in batch:
            self._candle_mark = batch["candle_marks"]

    def restore(self, state: dict) -> dict:
        """Rebuild from stored rows (see trading_store.load). Returns what was restored."""
        global _order_ids
        for product, spot in state.get("spot", []):
            if product in self._spot:
                self._spot[product] = spot
        bars: dict[str, list] = {}
        for sym, t, o, h, l, c, v in state.get("candles", []):
            bars.setdefault(sym, []).append({"t": t, "o": o, "h": h, "l": l, "c": c, "v": v})
        last_px: dict[str, float] = {}
        for sym, settle, op, hi, lo, last, last_size, volume, oi in state.get("instruments", []):
            last_px[sym] = last
            inst = self.instruments.get(sym)
            if inst is None:
                continue
            if bars.get(sym):
                inst.candles = sorted(bars[sym], key=lambda b: b["t"])[-1500:]
                self._candle_mark[sym] = inst.candles[-1]["t"]
            inst.settle, inst.open, inst.high, inst.low = settle, op, hi, lo
            inst.last, inst.last_size, inst.volume, inst.open_interest = last, last_size, volume, oi

        for owner, cash, fees, start_equity in state.get("accounts", []):
            self.accounts[owner] = Account(owner=owner, cash=cash, fees=fees, start_equity=start_equity)
        for owner, sym, qty, avg, realized in state.get("positions", []):
            acct = self.accounts.get(owner)
            if acct is not None:
                acct.positions[sym] = Position(qty=qty, avg_price=avg, realized=realized)
        for owner, order_id, sym, side, qty, price, fee, liq, t in state.get("fills", []):  # newest first
            acct = self.accounts.get(owner)
            if acct is not None:
                acct.fills.append({"order_id": order_id, "symbol": sym, "side": side, "qty": qty,
                                   "price": price, "fee": fee, "liquidity": liq, "time": t})

        max_id = 0
        expired_orders = 0
        for row in sorted(state.get("orders", [])):
            (oid, owner, sym, side, qty, typ, tif, price, stop, filled, avg_fill, status, reason,
             created, updated) = row
            max_id = max(max_id, oid)
            acct = self.accounts.get(owner)
            if acct is None:
                continue
            o = Order(id=oid, owner=owner, symbol=sym, side=side, qty=qty, type=typ, tif=tif, price=price,
                      stop=stop, filled=filled, avg_fill=avg_fill, status=status, reason=reason,
                      created=created, updated=updated)
            acct.orders[oid] = o
            self._saved_orders[oid] = tuple(row)
            if status not in ("WORKING", "PARTIAL", "PENDING"):
                continue
            inst = self.instruments.get(sym)
            if inst is None:
                o.status, o.reason, o.updated = "CANCELLED", "Contract expired", time.time()
                self._dirty.add(owner)
                expired_orders += 1
            elif status == "PENDING":
                inst.stops.append(o)
            else:
                (inst.bids if side == "BUY" else inst.asks).setdefault(price, deque()).append(o)
        _order_ids = itertools.count(max(max_id + 1, next(_order_ids)))

        # Contracts that expired while we were down: close at their last price.
        settled = 0
        for acct in self.accounts.values():
            for sym in [s for s in acct.positions if s not in self.instruments]:
                pos = acct.positions.pop(sym)
                if pos.qty:
                    px = last_px.get(sym) or pos.avg_price
                    pnl = (px - pos.avg_price) * pos.qty * CONTRACT_SIZE
                    acct.cash += pnl
                    fill = {"order_id": None, "symbol": sym, "side": "SELL" if pos.qty > 0 else "BUY",
                            "qty": abs(pos.qty), "price": round(px, 2), "fee": 0.0, "liquidity": "EXPIRY",
                            "time": datetime.now(timezone.utc).isoformat()}
                    acct.fills.appendleft(fill)
                    acct.unsaved_fills.append(fill)
                    settled += 1
                self._dirty.add(acct.owner)

        # Re-quote around the restored prices; resting user orders the market has
        # moved through trade now, as they would at a reopen.
        for inst in self.instruments.values():
            inst.fair = self._fair(inst)
            self._requote(inst)
        return {"accounts": len(state.get("accounts", [])), "orders": len(state.get("orders", [])),
                "expired_positions_settled": settled, "expired_orders_cancelled": expired_orders}

    # ── views ──
    def _account_metrics(self, acct: Account) -> dict:
        unrealized = margin = 0.0
        for sym, pos in acct.positions.items():
            if pos.qty:
                inst = self.instruments[sym]
                unrealized += (inst.mark() - pos.avg_price) * pos.qty * CONTRACT_SIZE
                margin += abs(pos.qty) * inst.spec["initial_margin"]
        equity = acct.cash + unrealized
        return {
            "cash": round(acct.cash, 2), "equity": round(equity, 2),
            "unrealized_pnl": round(unrealized, 2),
            "realized_pnl": round(sum(p.realized for p in acct.positions.values()), 2),
            "fees": round(acct.fees, 2), "margin_used": round(margin, 2),
            "maintenance_margin": round(margin * 0.9, 2),
            "buying_power": round(equity - margin, 2),
            "day_pnl": round(equity - acct.start_equity, 2),
        }

    def account(self, owner: str) -> dict:
        acct = self.account_for(owner)
        positions = []
        for sym, pos in acct.positions.items():
            if pos.qty == 0 and pos.realized == 0:
                continue
            inst = self.instruments[sym]
            mark = inst.mark()
            positions.append({
                "symbol": sym, "product": inst.product, "qty": pos.qty,
                "avg_price": round(pos.avg_price, 4), "mark": round(mark, 2),
                "unrealized_pnl": round((mark - pos.avg_price) * pos.qty * CONTRACT_SIZE, 2) if pos.qty else 0.0,
                "realized_pnl": round(pos.realized, 2),
                "offsets": pos.qty * CONTRACT_SIZE,
                "margin": abs(pos.qty) * inst.spec["initial_margin"],
            })
        orders = sorted(acct.orders.values(), key=lambda o: o.id, reverse=True)
        return {
            "owner": owner, **self._account_metrics(acct),
            "positions": positions,
            "working_orders": [o.to_dict() for o in orders if o.status in ("WORKING", "PARTIAL", "PENDING")],
            "order_history": [o.to_dict() for o in orders[:100]],
            "fills": list(acct.fills)[:100],
        }

    def market_snapshot(self, depth_levels: int = 10, focus: str | None = None) -> dict:
        """Quotes for all contracts; depth and tape for `focus` only (or all if None)."""
        insts = {focus: self.instruments[focus]} if focus in self.instruments else self.instruments
        return {
            "venue": self.venue_name, "simulated": True,
            "time": datetime.now(timezone.utc).isoformat(),
            "quotes": [i.quote() for i in self.instruments.values()],
            "depth": {s: i.depth(depth_levels) for s, i in insts.items()},
            "tape": {s: list(i.tape)[:40] for s, i in insts.items()},
            "news": list(self.news)[:15],
        }

    def candles(self, symbol: str, minutes: int = 1, limit: int = 240) -> list[dict]:
        inst = self.instruments.get(symbol)
        if inst is None:
            return []
        if minutes <= 1:
            return inst.candles[-limit:]
        out: list[dict] = []
        for c in inst.candles:
            bucket = c["t"] - c["t"] % (minutes * 60)
            if out and out[-1]["t"] == bucket:
                b = out[-1]
                b["h"], b["l"], b["c"] = max(b["h"], c["h"]), min(b["l"], c["l"]), c["c"]
                b["v"] += c["v"]
            else:
                out.append({**c, "t": bucket})
        return out[-limit:]

    def contract_specs(self) -> list[dict]:
        return [{
            "product": p, "name": s["name"], "description": s["description"],
            "contract_size": CONTRACT_SIZE, "unit": "offsets (1 offset = 1 tCO2e)",
            "tick": TICK, "tick_value": TICK_VALUE, "initial_margin": s["initial_margin"],
            "settlement": "Physical delivery via registry transfer",
            "corsia_eligible": s["corsia_eligible"],
            "listed": [i.symbol for i in self.instruments.values() if i.product == p],
        } for p, s in PRODUCTS.items()]


venue = SimulatedVenue()
