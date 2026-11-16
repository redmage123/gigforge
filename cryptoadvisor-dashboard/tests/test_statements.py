"""Statements PDF, monthly generation, and portfolios API route order."""

import asyncio
import sys
from datetime import date, timedelta
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest  # noqa: E402

from services import cash, performance as perf, portfolios, statements, trades  # noqa: E402
from services.market import registry  # noqa: E402
from services.market.models import Candle, Instrument  # noqa: E402

D0 = date(2026, 9, 1)


@pytest.fixture(autouse=True)
def world():
    registry.load_for_tests([Instrument("stock:X", "stock", "X", "X Corp", {"yahoo": "X"}, sessions="us_equity"),
                             Instrument("index:SPX", "index", "SPX", "S&P 500", {"yahoo": "^GSPC"})])

    async def candles(iid, tf, n):
        return [Candle(int((D0 + timedelta(i) - date(1970, 1, 1)).total_seconds() * 1000), 0, 0, 0, 100 + i, 0) for i in range(80)]

    with patch.object(perf.market, "candles", candles), patch("services.auth.load_users", lambda: [{"username": "pm", "first_name": "Pat"}]):
        yield


def test_pdf_and_monthly_generation():
    pid = portfolios.default_id("pm")
    portfolios.update("pm", pid, {"client_name": "Ann Smith"})
    cash.add_entry("pm", pid, "deposit", 5000, D0.isoformat())
    trades.add_trade("pm", "stock:X", "buy", 100, 10, D0.isoformat(), portfolio_id=pid)
    pdf = asyncio.run(statements.build_pdf("pm", pid, D0, D0 + timedelta(days=45), "Pat"))
    assert pdf[:5] == b"%PDF-" and len(pdf) > 3000
    sent = []
    with patch("services.notifications.add_notification", lambda u, t, m, category: sent.append(t)):
        asyncio.run(statements.generate_monthly(date(2026, 11, 2)))
        asyncio.run(statements.generate_monthly(date(2026, 11, 2)))  # idempotent
    assert [s["month"] for s in statements.list_stored("pm", pid)] == ["2026-10"]
    assert statements.read_stored("pm", pid, "2026-10")[:5] == b"%PDF-" and sent == ["October statements are ready"]
    assert statements.read_stored("pm", pid, "../x") is None


def test_static_routes_before_pid_routes():
    from api.portfolios import router
    paths = [(r.path, sorted(r.methods)) for r in router.routes]
    first_pid = next(i for i, (p, _) in enumerate(paths) if "{pid}" in p)
    assert all("{pid}" in p for p, _ in paths[first_pid:])
    assert ("/allocation", ["PUT"]) in paths[:first_pid]
