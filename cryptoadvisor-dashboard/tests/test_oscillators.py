"""RSI, Stochastic RSI and the combined chart endpoint (every pane on the same bars)."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest  # noqa: E402
from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from services.indicators.oscillators import OscSettings, rsi, sma, stoch_rsi, stochastic  # noqa: E402
from services.market.models import Candle  # noqa: E402

# Wilder's worked example as published by StockCharts (14-period RSI)
CLOSES = [44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.10, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28,
          46.00, 46.03, 46.41, 46.22, 45.64]
EXPECTED = {14: 70.46, 15: 66.25, 16: 66.48, 17: 69.35, 18: 66.29, 19: 57.92}


def test_rsi_matches_the_published_example():
    r = rsi(CLOSES, 14)
    assert all(v is None for v in r[:14])
    for i, want in EXPECTED.items():
        assert r[i] == pytest.approx(want, abs=0.02), i


def test_rsi_edges():
    assert rsi([1, 2, 3, 4, 5], 2)[-1] == 100.0          # only gains
    assert rsi([5, 4, 3, 2, 1], 2)[-1] == 0.0            # only losses
    assert rsi([3, 3, 3, 3], 2)[-1] == 50.0              # flat
    assert rsi([1, 2], 14) == [None, None]               # too short


def test_stochastic_and_sma():
    assert stochastic([1, 2, 3, 2, None, 5], 3) == [None, None, 100.0, 0.0, None, None]
    assert stochastic([4, 4, 4], 3)[-1] == 50.0
    assert sma([1, 2, 3, None, 5, 6, 7], 2) == [None, 1.5, 2.5, None, None, 5.5, 6.5]


def test_stoch_rsi_is_bounded_and_aligned():
    import math

    closes = [100 + 10 * math.sin(i / 5) + i * 0.1 for i in range(200)]
    st = OscSettings()
    r, k, d = stoch_rsi(closes, st)
    assert len(r) == len(k) == len(d) == len(closes)
    vals = [v for v in k + d if v is not None]
    assert vals and all(0 <= v <= 100 for v in vals)
    first_d = next(i for i, v in enumerate(d) if v is not None)
    assert first_d == st.rsi_period + st.stoch_period - 1 + st.k - 1 + st.d - 1


def test_settings_validation():
    assert OscSettings().validate() is None
    assert OscSettings(rsi_period=1).validate()
    assert OscSettings(k=0).validate()


# ── /api/instruments/{id}/chart ───────────────────────────────────────────

def _candles(n):
    import math

    out = []
    for i in range(n):
        c = 100 + 5 * math.sin(i / 7)
        out.append(Candle(1_700_000_000_000 + i * 3_600_000, c - 0.5, c + 1, c - 1, c, 1000.0))
    return out


@pytest.fixture
def client(monkeypatch):
    from api import instruments
    from services import market

    asked = {}

    async def fake_candles(instrument_id, timeframe="1d", bars=100, prefer_perp=False):
        asked.update(id=instrument_id, timeframe=timeframe, bars=bars)
        return _candles(bars)

    monkeypatch.setattr(market, "candles", fake_candles)
    app = FastAPI()
    app.include_router(instruments.router, prefix="/api/instruments")
    c = TestClient(app)
    c.asked = asked
    return c


def test_chart_returns_every_pane_on_the_same_bars(client):
    r = client.get("/api/instruments/crypto:BTC/chart?timeframe=30m&bars=120")
    assert r.status_code == 200, r.text
    body = r.json()
    n = len(body["t"])
    assert n == 120
    assert len(body["candles"]) == len(body["rsi"]) == len(body["stoch_k"]) == len(body["stoch_d"]) == n
    assert all(len(s) == n for s in body["surgex"]["series"].values())
    assert [c["t"] for c in body["candles"]] == body["t"]
    # Warm-up history was fetched, so every indicator has a value from the first bar shown
    assert client.asked["bars"] > 120 and client.asked["timeframe"] == "30m"
    assert body["rsi"][0] is not None and body["stoch_d"][0] is not None
    assert body["surgex"]["series"]["surge"][0] is not None


def test_chart_rejects_bad_settings(client):
    assert client.get("/api/instruments/crypto:BTC/chart?timeframe=7m").status_code == 400
    assert client.get("/api/instruments/crypto:BTC/chart?rsi_period=1").status_code == 400
    assert client.get("/api/instruments/crypto:BTC/chart?period_d=1").status_code == 400


def test_new_candle_sizes_are_supported():
    from services.market.providers import TIMEFRAMES, YAHOO_TIMEFRAMES

    for tf in ("5m", "15m", "30m", "1h", "4h", "1d", "1w"):
        assert tf in TIMEFRAMES and tf in YAHOO_TIMEFRAMES
