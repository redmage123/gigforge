"""Column-mapped CSV import. Run: pytest tests/test_csv_mapping.py -q"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest  # noqa: E402

from services import csv_mapping as cm  # noqa: E402
from services.market import registry  # noqa: E402
from services.market.models import Instrument  # noqa: E402

FUTURES = b"""Trade History Export
Account: 12345
Filled Time,Contract,Direction,Open/Close,Filled Qty,Avg. Fill Price (USDT),Trading Fee (USDT),Status
16/11/2026 14:05:31,BTCUSDT,Long,Open,0.5,70000.0,-17.5,Filled
16/11/2026 18:10:02,BTCUSDT,Long,Close,0.5,71000,-17.75,Filled
17/11/2026 09:00:00,ETH-USDT-PERP,Short,Open,2,3500,1.4,Filled
17/11/2026 09:30:00,ETHUSDT,Short,Open,0,0,0,Cancelled
17/11/2026 10:00:00,DOGEUSDT,Long,Open,100,0.2,0,Filled
"""


@pytest.fixture(autouse=True)
def world():
    registry.load_for_tests([
        Instrument("crypto:BTC", "crypto", "BTC", "Bitcoin", {"binance": "BTCUSDT"}),
        Instrument("crypto:ETH", "crypto", "ETH", "Ethereum", {"binance": "ETHUSDT"}),
        Instrument("stock:AAPL", "stock", "AAPL", "Apple Inc.", {"yahoo": "AAPL"}, sessions="us_equity"),
    ])


def test_reads_past_preamble_and_suggests_mapping():
    headers, rows = cm.read_table(FUTURES)
    assert headers[0] == "Filled Time" and len(rows) == 5
    m = cm.suggest_mapping(headers)
    assert m == {"date": "Filled Time", "symbol": "Contract", "side": "Direction", "action": "Open/Close",
                 "quantity": "Filled Qty", "price": "Avg. Fill Price (USDT)", "fee": "Trading Fee (USDT)"}


def test_futures_export_end_to_end():
    headers, rows = cm.read_table(FUTURES)
    trades, warnings = cm.apply_mapping(headers, rows, cm.suggest_mapping(headers))
    assert [(t["instrument_id"], t["side"], t["quantity"], t["price"]) for t in trades] == [
        ("crypto:BTC", "buy", 0.5, 70000.0),   # open long
        ("crypto:BTC", "sell", 0.5, 71000.0),  # close long
        ("crypto:ETH", "sell", 2.0, 3500.0),   # open short, "-PERP" suffix stripped
    ]
    assert trades[0]["date"] == "2026-11-16 14:05:31" and trades[0]["fee"] == 17.5  # day-first detected, fee abs
    assert any("zero quantity" in w for w in warnings) and any("crypto:DOGE not found" in w for w in warnings)


def test_quantity_multiplier_for_lots():
    headers, rows = cm.read_table(FUTURES)
    trades, _ = cm.apply_mapping(headers, rows, {**cm.suggest_mapping(headers), "quantity_multiplier": "0.001"})
    assert trades[0]["quantity"] == pytest.approx(0.0005)


@pytest.mark.parametrize("side,action,want", [
    ("Buy", "", "buy"), ("SELL", "", "sell"), ("Open Long", "", "buy"), ("Close Long", "", "sell"),
    ("Open Short", "", "sell"), ("Close Short", "", "buy"), ("Short", "Close", "buy"), ("Buy to open", "", "buy"),
    ("hold", "", None),
])
def test_side(side, action, want):
    assert cm.parse_side(side, action) == want


@pytest.mark.parametrize("raw,day_first,want", [
    ("2026-11-16T14:05:31.123Z", True, "2026-11-16 14:05:31"),
    ("2026/11/16 14:05", True, "2026-11-16 14:05:00"),
    ("03/04/2026 10:00:00", True, "2026-04-03 10:00:00"),
    ("03/04/2026 10:00:00", False, "2026-03-04 10:00:00"),
    ("1794837931000", True, "2026-11-16 14:05:31"),
    ("2026-11-16 14:05:31 UTC+8", True, "2026-11-16 14:05:31"),
])
def test_dates(raw, day_first, want):
    assert cm.parse_date(raw, day_first) == want


def test_semicolon_and_auto_class():
    headers, rows = cm.read_table(b"Date;Ticker;Side;Qty;Price\n2026-01-02;AAPL;buy;10;200\n")
    trades, _ = cm.apply_mapping(headers, rows, {**cm.suggest_mapping(headers), "asset_class": "auto"})
    assert trades[0]["instrument_id"] == "stock:AAPL"


def test_missing_required_column():
    headers, rows = cm.read_table(FUTURES)
    with pytest.raises(ValueError, match="price"):
        cm.apply_mapping(headers, rows, {k: v for k, v in cm.suggest_mapping(headers).items() if k != "price"})
