"""Unit tests for multi-asset trades: P&L replay (long/short/flip, multipliers), valuation, legacy data, CSV.

Run with: pytest tests/test_trades.py -q   (no network)
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest  # noqa: E402

from services import csv_import  # noqa: E402
from services.market import registry  # noqa: E402
from services.market.models import Instrument  # noqa: E402
from services.trades import normalize_trade, replay, value_positions  # noqa: E402


def T(iid, side, qty, price, date, fee=0.0, n=0):
    return {"instrument_id": iid, "side": side, "quantity": qty, "price": price, "date": date, "fee": fee, "created_at": n}


@pytest.fixture(autouse=True)
def instruments():
    registry.load_for_tests([
        Instrument("crypto:BTC", "crypto", "BTC", "Bitcoin", {"binance": "BTCUSDT", "coingecko": "bitcoin"}),
        Instrument("stock:AAPL", "stock", "AAPL", "Apple Inc.", {"yahoo": "AAPL"}, sessions="us_equity"),
        Instrument("etf:BTC", "etf", "BTC", "Grayscale Bitcoin Mini Trust", {"yahoo": "BTC"}, sessions="us_equity"),
    ])
    yield


class TestReplay:
    def test_average_cost_and_partial_sell(self):
        p = replay([T("stock:AAPL", "buy", 10, 100, "d1"), T("stock:AAPL", "buy", 10, 120, "d2"),
                    T("stock:AAPL", "sell", 5, 130, "d3")])["stock:AAPL"]
        assert p["qty"] == 15 and p["avg"] == 110
        assert p["realized"] == 5 * (130 - 110)

    def test_order_is_by_date_not_entry(self):
        p = replay([T("stock:AAPL", "sell", 5, 130, "2026-03-01"), T("stock:AAPL", "buy", 10, 100, "2026-01-01")])["stock:AAPL"]
        assert p["qty"] == 5 and p["realized"] == 150

    def test_short_then_cover(self):
        p = replay([T("crypto:BTC", "sell", 2, 60000, "d1"), T("crypto:BTC", "buy", 2, 55000, "d2")])["crypto:BTC"]
        assert p["qty"] == 0 and p["avg"] == 0 and p["realized"] == 10000

    def test_flip_long_to_short(self):
        p = replay([T("crypto:BTC", "buy", 1, 50000, "d1"), T("crypto:BTC", "sell", 3, 60000, "d2")])["crypto:BTC"]
        assert p["qty"] == -2 and p["avg"] == 60000 and p["realized"] == 10000

    def test_futures_multiplier_and_fees(self):
        # Gold: $100 per $1 move per contract
        p = replay([T("commodity:GC", "buy", 2, 4000, "d1", fee=5), T("commodity:GC", "sell", 2, 4010.5, "d2", fee=5)],
                   {"commodity:GC": 100})["commodity:GC"]
        assert p["realized"] == pytest.approx(2 * 10.5 * 100 - 10)


class TestValuation:
    def test_long_short_unpriced_and_totals(self):
        pos = replay([T("stock:AAPL", "buy", 10, 100, "d1"), T("crypto:BTC", "sell", 1, 60000, "d1"),
                      T("commodity:GC", "buy", 1, 4000, "d1")], {"commodity:GC": 100})
        prices = {"stock:AAPL": {"price": 110, "change_pct": 10.0}, "crypto:BTC": {"price": 50000, "change_pct": 0.0}}
        info = {"stock:AAPL": {"asset_class": "stock", "multiplier": 1}, "crypto:BTC": {"asset_class": "crypto", "multiplier": 1},
                "commodity:GC": {"asset_class": "commodity", "multiplier": 100}}
        out = value_positions(pos, prices, info)
        rows = {r["instrument_id"]: r for r in out["positions"]}
        assert rows["stock:AAPL"]["unrealized_pnl"] == 100 and rows["stock:AAPL"]["day_pnl"] == 100
        assert rows["crypto:BTC"]["side"] == "short" and rows["crypto:BTC"]["unrealized_pnl"] == 10000
        assert rows["crypto:BTC"]["market_value"] == -50000
        gc = rows["commodity:GC"]
        assert gc["price_available"] is False and gc["unrealized_pnl"] is None and gc["cost_basis"] == 400000
        t = out["totals"]
        assert t["unrealized_pnl"] == 10100 and t["unpriced"] == 1
        assert t["long_exposure"] == 1100 and t["short_exposure"] == 50000
        assert out["by_class"]["crypto"]["unrealized_pnl"] == 10000

    def test_day_pnl_counts_only_since_entry_for_todays_positions(self):
        pos = replay([T("stock:AAPL", "buy", 10, 100, "2026-11-05"), T("crypto:BTC", "buy", 1, 50000, "2026-11-01")])
        prices = {"stock:AAPL": {"price": 101, "change_pct": 10.0}, "crypto:BTC": {"price": 55000, "change_pct": 10.0}}
        rows = {r["instrument_id"]: r for r in value_positions(pos, prices, {}, today="2026-11-05")["positions"]}
        assert rows["stock:AAPL"]["day_pnl"] == 10  # bought today at 100, now 101
        assert rows["crypto:BTC"]["day_pnl"] == 5000  # held since Nov 1: 55,000 vs a 50,000 previous close

    def test_closed_positions_listed_separately(self):
        pos = replay([T("stock:AAPL", "buy", 1, 100, "d1"), T("stock:AAPL", "sell", 1, 150, "d2")])
        out = value_positions(pos, {}, {})
        assert out["positions"] == [] and out["closed"][0]["realized_pnl"] == 50 and out["totals"]["realized_pnl"] == 50


class TestLegacy:
    def test_coingecko_trade_becomes_instrument(self):
        t = normalize_trade({"id": "x", "coin_id": "bitcoin", "side": "buy", "price": 1, "quantity": 2, "date": "d"})
        assert t["instrument_id"] == "crypto:BTC" and t["coin_id"] == "crypto:BTC"

    def test_old_csv_shape(self):
        t = normalize_trade({"coin": "ETH", "type": "BUY", "amount": "0.5", "price": "2400", "date": "d"})
        assert (t["instrument_id"], t["side"], t["quantity"]) == ("crypto:ETH", "buy", 0.5)

    def test_new_trade_untouched(self):
        t = normalize_trade({"instrument_id": "stock:AAPL", "side": "sell", "quantity": 1, "price": 2, "date": "d"})
        assert t["instrument_id"] == "stock:AAPL"


class TestGenericCsv:
    def test_symbols_classes_and_warnings(self):
        csv = (b"Date,Symbol,Side,Quantity,Price,Fee,Asset_Class\n"
               b"2026-10-01,AAPL,Buy,10,\"1,200.50\",1,\n"
               b"2026-10-02,BTC,sell,0.1,60000,,crypto\n"
               b"2026-10-03,BTC,buy,5,50,,\n"
               b"2026-10-04,NOPE,buy,1,1,,\n"
               b"2026-10-05,AAPL,hold,1,1,,\n")
        rows = asyncio.run(csv_import.parse_generic_csv(csv))
        warnings = rows[0]["_warnings"]
        assert [(r["instrument_id"], r["side"], r["quantity"], r["price"]) for r in rows] == [
            ("stock:AAPL", "buy", 10, 1200.5), ("crypto:BTC", "sell", 0.1, 60000), ("etf:BTC", "buy", 5, 50)]
        assert any("matches etf:BTC, crypto:BTC" in w for w in warnings)
        assert any("NOPE" in w for w in warnings) and any("buy or sell" in w for w in warnings)

    def test_instrument_column(self):
        rows = asyncio.run(csv_import.parse_generic_csv(b"date,instrument,side,qty,price\n2026-01-01,crypto:BTC,BUY,1,2\n"))
        assert rows[0]["instrument_id"] == "crypto:BTC"

    def test_all_rows_bad_raises(self):
        with pytest.raises(ValueError, match="not found"):
            asyncio.run(csv_import.parse_generic_csv(b"date,symbol,side,qty,price\n2026-01-01,NOPE,buy,1,1\n"))


class TestForex:
    def test_quote_currency_converted_to_usd(self):
        # Long 100,000 USD/JPY at 150.00, now 151.00: +100,000 JPY of P&L, worth 100,000/151 USD
        pos = replay([T("fx:USDJPY", "buy", 100_000, 150.0, "2026-11-01"), T("fx:EURGBP", "sell", 50_000, 0.86, "2026-11-01"),
                      T("fx:EURUSD", "buy", 10_000, 1.08, "2026-11-01")])
        prices = {"fx:USDJPY": {"price": 151.0, "change_pct": 0.0}, "fx:EURGBP": {"price": 0.85, "change_pct": 0.0},
                  "fx:EURUSD": {"price": 1.09, "change_pct": 0.0}}
        info = {"fx:USDJPY": {"asset_class": "fx", "currency": "JPY"}, "fx:EURGBP": {"asset_class": "fx", "currency": "GBP"},
                "fx:EURUSD": {"asset_class": "fx", "currency": "USD"}}
        out = value_positions(pos, prices, info, today="2026-11-05", fx_usd={"JPY": 1 / 151.0, "GBP": 1.30})
        rows = {r["instrument_id"]: r for r in out["positions"]}
        assert rows["fx:USDJPY"]["unrealized_pnl"] == pytest.approx(100_000 / 151.0, abs=0.01)
        assert rows["fx:USDJPY"]["market_value"] == pytest.approx(100_000, abs=0.01)  # 100k USD notional
        assert rows["fx:EURGBP"]["unrealized_pnl"] == pytest.approx(50_000 * 0.01 * 1.30, abs=0.01)  # short gained 0.01 GBP/EUR
        assert rows["fx:EURUSD"]["unrealized_pnl"] == pytest.approx(100, abs=0.01)
        assert rows["fx:USDJPY"]["currency"] == "JPY"

    def test_missing_rate_is_unpriced_not_zero(self):
        pos = replay([T("fx:USDTRY", "buy", 1000, 40.0, "2026-11-01")])
        out = value_positions(pos, {"fx:USDTRY": {"price": 41.0}}, {"fx:USDTRY": {"asset_class": "fx", "currency": "TRY"}}, fx_usd={})
        row = out["positions"][0]
        assert row["price_available"] is False and row["unrealized_pnl"] is None and out["totals"]["unpriced"] == 1

    def test_realized_converts_and_fees_stay_usd(self):
        pos = replay([T("fx:USDJPY", "buy", 100_000, 150.0, "d1", fee=5), T("fx:USDJPY", "sell", 100_000, 152.0, "d2", fee=5)])
        out = value_positions(pos, {}, {"fx:USDJPY": {"asset_class": "fx", "currency": "JPY"}}, fx_usd={"JPY": 0.01})
        assert out["closed"][0]["realized_pnl"] == pytest.approx(200_000 * 0.01 - 10)

    def test_csv_pairs(self):
        registry.load_for_tests([])  # curated catalog includes the forex pairs
        rows = asyncio.run(csv_import.parse_generic_csv(b"date,symbol,side,qty,price,asset_class\n2026-01-01,EUR/USD,buy,10000,1.08,forex\n"))
        assert rows[0]["instrument_id"] == "fx:EURUSD"
