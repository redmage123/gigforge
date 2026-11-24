"""AI advanced endpoints (portfolio builder/optimizer, pattern detection, trading coach) with Claude stubbed.

Run: pytest tests/test_ai_advanced.py -q
"""

import sys
import time
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest  # noqa: E402
from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from starlette.middleware.base import BaseHTTPMiddleware  # noqa: E402

from services import claude_cli, market, trades  # noqa: E402
from services.ai_pattern_recognition import parse_patterns  # noqa: E402
from services.ai_trade_coach import compute_trade_stats  # noqa: E402
from services.claude_cli import ClaudeResult  # noqa: E402
from services.market import registry  # noqa: E402
from services.market.models import Candle, Instrument, Quote  # noqa: E402

USER = "coach"


@pytest.fixture
def world():
    registry.load_for_tests([
        Instrument("stock:AAPL", "stock", "AAPL", "Apple Inc.", {"yahoo": "AAPL"}, sessions="us_equity"),
        Instrument("crypto:BTC", "crypto", "BTC", "Bitcoin", {"binance": "BTCUSDT", "coingecko": "bitcoin"}),
    ])
    prices = {"stock:AAPL": 120.0, "crypto:BTC": 60_000.0}
    prompts = []
    reply = {"ok": True, "text": "AI says hello"}

    async def quotes(ids):
        return {i: Quote(i, prices[i], 1.5, None, time.time(), "test") for i in ids if i in prices}

    async def candles(iid, timeframe="1d", bars=100, prefer_perp=False):
        day = 86_400_000
        return [Candle(1_767_225_600_000 + n * day, 100 + n, 102 + n, 99 + n, 101 + n, 1e6) for n in range(bars)]

    async def run_claude(prompt, system=None, model=None):
        prompts.append(prompt)
        return ClaudeResult(reply["ok"], reply["text"])

    with patch.object(market, "quotes", quotes), patch.object(market, "candles", candles), \
            patch.object(claude_cli, "run_claude", run_claude):
        yield {"prompts": prompts, "reply": reply}


@pytest.fixture
def client(world):
    from api.ai_advanced import router

    app = FastAPI()

    async def as_user(request, call_next):
        request.state.user = {"sub": USER}
        return await call_next(request)

    app.add_middleware(BaseHTTPMiddleware, dispatch=as_user)
    app.include_router(router, prefix="/api/ai-advanced")
    return TestClient(app)


def _journal():
    a = trades.add_trade(USER, "stock:AAPL", "buy", 100.0, 10, date="2026-01-01")
    b = trades.add_trade(USER, "stock:AAPL", "sell", 110.0, 10, date="2026-01-11", fee=1)
    trades.add_trade(USER, "crypto:BTC", "buy", 50_000.0, 1, date="2026-01-05")
    c = trades.add_trade(USER, "crypto:BTC", "sell", 45_000.0, 0.5, date="2026-01-25")
    return a, b, c


# ── Pure helpers ────────────────────────────────────────────────────────────

def test_trade_stats_win_rate_and_hold_time():
    rows = [
        {"id": "1", "instrument_id": "stock:AAPL", "side": "buy", "quantity": 10, "price": 100, "fee": 0, "date": "2026-01-01"},
        {"id": "2", "instrument_id": "stock:AAPL", "side": "sell", "quantity": 10, "price": 110, "fee": 1, "date": "2026-01-11"},
        {"id": "3", "instrument_id": "crypto:BTC", "side": "buy", "quantity": 1, "price": 50_000, "fee": 0, "date": "2026-01-05"},
        {"id": "4", "instrument_id": "crypto:BTC", "side": "sell", "quantity": 0.5, "price": 45_000, "fee": 0, "date": "2026-01-25"},
    ]
    s = compute_trade_stats(rows)
    assert (s["total_trades"], s["buys"], s["sells"], s["closed_trades"]) == (4, 2, 2, 2)
    assert (s["wins"], s["losses"], s["win_rate"]) == (1, 1, 50.0)
    assert s["trade_pnl"] == {"2": 99.0, "4": -2500.0}
    assert s["realized_pnl"] == -2401.0 and s["total_fees"] == 1.0
    assert s["avg_hold_days"] == 15.0  # 10 and 20 days
    assert s["first_date"] == "2026-01-01" and s["last_date"] == "2026-01-25"


def test_trade_stats_shorts_and_multiplier():
    rows = [
        {"id": "1", "instrument_id": "commodity:GC", "side": "sell", "quantity": 1, "price": 2000, "date": "2026-02-01"},
        {"id": "2", "instrument_id": "commodity:GC", "side": "buy", "quantity": 1, "price": 1990, "date": "2026-02-03"},
    ]
    s = compute_trade_stats(rows, {"commodity:GC": 100})
    assert s["trade_pnl"] == {"2": 1000.0} and s["win_rate"] == 100.0 and s["avg_hold_days"] == 2.0


def test_trade_stats_empty():
    s = compute_trade_stats([])
    assert s["total_trades"] == 0 and s["win_rate"] is None and s["avg_hold_days"] is None


def test_parse_patterns_json_and_free_text():
    reply = ('Here you go: {"summary": "Uptrend.", "patterns": [{"name": "Bull flag", "confidence": "HIGH", '
             '"implication": "Bullish", "target_price": "130.5", "description": "Tight range."}, {"no": "name"}]}')
    out = parse_patterns(reply)
    assert out["summary"] == "Uptrend."
    assert out["patterns"] == [{"name": "Bull flag", "confidence": "high", "implication": "bullish",
                                "target_price": 130.5, "description": "Tight range."}]
    assert parse_patterns("No clear patterns.") == {"summary": "No clear patterns.", "patterns": []}


# ── Endpoints ───────────────────────────────────────────────────────────────

def test_portfolio_builder(client, world):
    r = client.post("/api/ai-advanced/portfolio-builder", json={"description": "Conservative", "budget": 5000})
    assert r.status_code == 200 and r.json()["analysis"] == "AI says hello"
    assert "Conservative" in world["prompts"][0] and "5,000.00" in world["prompts"][0]


def test_ai_failure_is_a_readable_502(client, world):
    world["reply"].update(ok=False, text="Claude CLI timed out after 180s")
    r = client.post("/api/ai-advanced/portfolio-builder", json={"description": "x", "budget": 100})
    assert r.status_code == 502 and "timed out" in r.json()["error"]


def test_ai_exception_is_a_502_not_500(client, world):
    async def boom(*a, **k):
        raise RuntimeError("kaput")

    with patch.object(claude_cli, "run_claude", boom):
        r = client.post("/api/ai-advanced/portfolio-builder", json={"description": "x", "budget": 100})
    assert r.status_code == 502 and "kaput" in r.json()["error"]


def test_portfolio_optimize_uses_holdings(client, world):
    r = client.post("/api/ai-advanced/portfolio-optimize", json={"goal": "reduce risk"})
    assert r.status_code == 400 and "no open positions" in r.json()["error"]
    _journal()
    r = client.post("/api/ai-advanced/portfolio-optimize", json={"goal": "reduce risk"})
    assert r.status_code == 200 and r.json()["analysis"] == "AI says hello" and r.json()["positions"] == 1
    assert "BTC (Bitcoin, crypto)" in world["prompts"][-1] and "reduce risk" in world["prompts"][-1]


def test_pattern_detect_structured(client, world):
    world["reply"]["text"] = ('{"summary": "Steady climb.", "patterns": [{"name": "Ascending triangle", '
                              '"confidence": "medium", "implication": "bullish", "target_price": 175}]}')
    r = client.post("/api/ai-advanced/pattern-detect", json={"coin": "bitcoin"})  # legacy id still works
    body = r.json()
    assert r.status_code == 200 and body["coin"] == "crypto:BTC" and body["summary"] == "Steady climb."
    assert body["patterns"][0]["name"] == "Ascending triangle" and body["patterns"][0]["target_price"] == 175
    assert "Bitcoin (BTC, crypto)" in world["prompts"][0] and "C:160" in world["prompts"][0]  # last 30 of 60 bars


def test_pattern_detect_unknown_and_no_data(client, world):
    assert client.post("/api/ai-advanced/pattern-detect", json={"coin": "stock:NOPE"}).status_code == 400

    async def no_data(*a, **k):
        raise LookupError("no market data for stock:AAPL")

    with patch.object(market, "candles", no_data):
        r = client.post("/api/ai-advanced/pattern-detect", json={"coin": "stock:AAPL"})
    assert r.status_code == 502 and "price history" in r.json()["error"]


def test_trade_coach_post_mortem(client, world):
    _, sell, _ = _journal()
    r = client.post("/api/ai-advanced/trade-coach", json={"trade_id": sell["id"]})
    body = r.json()
    assert r.status_code == 200 and body["analysis"] == "AI says hello"
    assert body["market"]["realized_pnl_of_this_trade"] == 99.0 and body["market"]["price_now"] == 120.0
    assert '"side": "sell"' in world["prompts"][0] and "Apple Inc." in world["prompts"][0]
    assert client.post("/api/ai-advanced/trade-coach", json={"trade_id": "nope"}).status_code == 404


def test_trading_insights_real_numbers(client, world):
    empty = client.post("/api/ai-advanced/trading-insights").json()
    assert empty["total_trades"] == 0 and empty["analysis"] is None and not world["prompts"]
    _journal()
    body = client.post("/api/ai-advanced/trading-insights").json()
    assert (body["total_trades"], body["win_rate"], body["avg_hold_days"]) == (4, 50.0, 15.0)
    assert body["analysis"] == "AI says hello" and body["ai_error"] is None and "trade_pnl" not in body
    assert "realized_pnl=-2500.00" in world["prompts"][0]


def test_trading_insights_keeps_stats_when_ai_fails(client, world):
    _journal()
    world["reply"].update(ok=False, text="not logged in")
    r = client.post("/api/ai-advanced/trading-insights")
    assert r.status_code == 200 and r.json()["total_trades"] == 4
    assert r.json()["analysis"] is None and "not logged in" in r.json()["ai_error"]


def test_tax_impact_accepts_the_tax_optimizer_page_request(world):
    """AiTaxOptimizer.jsx sends {trade: {coin_id, side, quantity, price}} with an instrument id."""
    from api.ai_analysis import router

    app = FastAPI()

    async def as_user(request, call_next):
        request.state.user = {"sub": USER}
        return await call_next(request)

    app.add_middleware(BaseHTTPMiddleware, dispatch=as_user)
    app.include_router(router, prefix="/api/ai")
    c = TestClient(app)
    _journal()
    r = c.post("/api/ai/tax/impact", json={"trade": {"coin_id": "stock:AAPL", "side": "sell", "quantity": 5, "price": 120}})
    assert r.status_code == 200 and r.json()["impact"] == "AI says hello"
    assert "sell 5 stock:AAPL" in world["prompts"][0] and "Average cost basis: 100.00" in world["prompts"][0]
    # The page's old body was rejected
    assert c.post("/api/ai/tax/impact", json={"coin": "bitcoin", "type": "buy", "amount": 1, "price": 1}).status_code == 422
