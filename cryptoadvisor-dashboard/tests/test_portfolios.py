"""Multiple portfolios: records, scope/access, per-portfolio replay and the combined view."""

import asyncio
import sys
import time
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest  # noqa: E402

from services import cash, portfolios, trades  # noqa: E402
from services.market import registry  # noqa: E402
from services.market.models import Instrument, Quote  # noqa: E402
from services.portfolios import AccessError  # noqa: E402


@pytest.fixture(autouse=True)
def world():
    registry.load_for_tests([
        Instrument("stock:AAPL", "stock", "AAPL", "Apple Inc.", {"yahoo": "AAPL"}, sessions="us_equity"),
        Instrument("crypto:BTC", "crypto", "BTC", "Bitcoin", {"binance": "BTCUSDT"}),
    ])
    prices = {"stock:AAPL": 110.0, "crypto:BTC": 50_000.0}

    async def quotes(ids):
        return {i: Quote(i, prices[i], 0.0, None, time.time(), "test") for i in ids if i in prices}

    from services import market
    with patch.object(market, "quotes", quotes), \
            patch("services.auth.load_users", lambda: [{"username": u} for u in ("pm", "client", "analyst")]):
        yield prices


def run(c):
    return asyncio.run(c)


def test_default_portfolio_and_legacy_trades():
    from services.user_data import save_user_data
    save_user_data("pm", "trades", [{"id": "old1", "instrument_id": "stock:AAPL", "side": "buy", "quantity": 1,
                                     "price": 100, "date": "2026-01-01"}])
    own = portfolios.list_own("pm")
    assert len(own) == 1 and own[0]["default"] and own[0]["name"] == "My portfolio"
    assert trades.get_trades("pm")[0]["portfolio_id"] == own[0]["id"]


def test_create_validate_and_rename():
    a = portfolios.create("pm", "Client A", kind="client", client_name="Ann Smith")
    assert a["kind"] == "client" and a["client_name"] == "Ann Smith"
    with pytest.raises(ValueError, match="already"):
        portfolios.create("pm", "client a")
    with pytest.raises(ValueError, match="Type"):
        portfolios.create("pm", "X", kind="hedge")
    assert portfolios.update("pm", a["id"], {"name": "Client A (IRA)"})["name"] == "Client A (IRA)"


def test_each_portfolio_replays_on_its_own():
    a = portfolios.create("pm", "A")["id"]
    b = portfolios.create("pm", "B")["id"]
    trades.add_trade("pm", "stock:AAPL", "buy", 100, 10, "2026-01-01", portfolio_id=a)
    trades.add_trade("pm", "stock:AAPL", "buy", 200, 10, "2026-01-02", portfolio_id=b)
    trades.add_trade("pm", "stock:AAPL", "sell", 150, 10, "2026-01-03", portfolio_id=b)  # B closes its own lot
    pa = run(trades.portfolio("pm", [a]))
    assert pa["positions"][0]["quantity"] == 10 and pa["totals"]["realized_pnl"] == 0
    pb = run(trades.portfolio("pm", [b]))
    assert pb["positions"] == [] and pb["totals"]["realized_pnl"] == -500.0  # (150-200) x 10
    allp = run(trades.portfolio("pm", None))
    # Combined: A's 10 shares at 100 still open; B's loss realized. One shared replay would have
    # wrongly closed A's lot at 150 (+500) and left B's at 200 open.
    pos = allp["positions"][0]
    assert pos["quantity"] == 10 and pos["avg_price"] == 100 and pos["unrealized_pnl"] == 100.0
    assert allp["totals"]["realized_pnl"] == -500.0
    assert {p["name"] for p in allp["portfolios"]} >= {"A", "B"}


def test_combined_long_and_short_nets():
    a = portfolios.create("pm", "Long")["id"]
    b = portfolios.create("pm", "Short")["id"]
    trades.add_trade("pm", "crypto:BTC", "buy", 40_000, 1, "2026-01-01", portfolio_id=a)
    trades.add_trade("pm", "crypto:BTC", "sell", 45_000, 1, "2026-01-01", portfolio_id=b)
    pos = run(trades.portfolio("pm", None))["positions"][0]
    assert pos["quantity"] == 0 and pos["side"] == "flat" and pos["avg_price"] is None
    assert pos["unrealized_pnl"] == 10_000 - 5_000 and len(pos["holdings"]) == 2


def test_scope_and_sharing():
    a = portfolios.create("pm", "Client A", kind="client")["id"]
    assert portfolios.resolve("pm", "all").combined
    with pytest.raises(AccessError) as e:
        portfolios.resolve("client", a)
    assert e.value.status == 404
    portfolios.grant("pm", a, "client", "viewer")
    s = portfolios.resolve("client", a)
    assert s.owner == "pm" and s.role == "viewer" and not s.can_write
    with pytest.raises(AccessError) as e:
        portfolios.write_target(s)
    assert e.value.status == 403
    portfolios.grant("pm", a, "analyst", "manager")
    assert portfolios.write_target(portfolios.resolve("analyst", a)) == a
    # Shared portfolios never join the grantee's own "all"
    assert a not in portfolios.resolve("client", "all").portfolio_ids
    assert [p["id"] for p in portfolios.shared_with("client")] == [a]
    with pytest.raises(ValueError, match="register"):
        portfolios.grant("pm", a, "nobody", "viewer")
    portfolios.revoke("pm", a, "client")
    with pytest.raises(AccessError):
        portfolios.resolve("client", a)


def test_delete_moves_or_drops_trades_and_cash():
    main = portfolios.default_id("pm")
    a = portfolios.create("pm", "A")["id"]
    trades.add_trade("pm", "stock:AAPL", "buy", 100, 1, "2026-01-01", portfolio_id=a)
    cash.add_entry("pm", a, "deposit", 1000, "2026-01-01")
    portfolios.delete("pm", a, move_to=main)
    assert {t["portfolio_id"] for t in trades.get_trades("pm")} == {main}
    assert cash.get_entries("pm")[0]["portfolio_id"] == main
    b = portfolios.create("pm", "B")["id"]
    trades.add_trade("pm", "stock:AAPL", "buy", 100, 1, "2026-01-01", portfolio_id=b)
    assert portfolios.delete("pm", b)["trades_deleted"] == 1
    with pytest.raises(ValueError, match="default"):
        portfolios.delete("pm", main)
