"""SurgeX indicator math. Run with: pytest tests/test_surgex.py -q (no network)"""

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest  # noqa: E402

from services.indicators.surgex import (  # noqa: E402
    SurgeSettings, alma, compute, describe, diff, heikin_ashi, peaks_troughs, price_series, wma,
)
from services.market.models import Candle  # noqa: E402


def C(i, o, h, l, c):
    return Candle(i * 1000, o, h, l, c, 0.0)


def pine_alma_reference(series, i, n, offset, sigma):
    """Literal transcription of Pine's documented ALMA loop, evaluated at bar i (series[k] = k bars ago)."""
    m = offset * (n - 1)
    s = n / sigma
    norm = total = 0.0
    for j in range(n):
        w = math.exp(-1 * (j - m) ** 2 / (2 * s ** 2))
        norm += w
        total += series[i - (n - j - 1)] * w
    return total / norm


class TestMovingAverages:
    def test_wma_matches_hand_calculation(self):
        out = wma([1, 2, 3, 4, 5], 3)
        assert out[:2] == [None, None]
        assert out[2] == pytest.approx((1 * 1 + 2 * 2 + 3 * 3) / 6)
        assert out[4] == pytest.approx((3 * 1 + 4 * 2 + 5 * 3) / 6)

    def test_wma_waits_for_full_non_na_window(self):
        assert wma([None, 1, 2, 3], 3) == [None, None, None, pytest.approx((1 + 4 + 9) / 6)]

    @pytest.mark.parametrize("offset,sigma", [(2.0, 1.0), (0.85, 6.0), (0.5, 3.0)])
    def test_alma_matches_pine_reference_loop(self, offset, sigma):
        xs = [math.sin(i / 3) * 10 + i for i in range(30)]
        out = alma(xs, 5, offset, sigma)
        for i in range(4, 30):
            assert out[i] == pytest.approx(pine_alma_reference(xs, i, 5, offset, sigma))
        assert out[3] is None


class TestPrices:
    def test_price_types(self):
        c = [C(0, 10, 14, 8, 12)]
        assert [price_series(c, t)[0] for t in ("close", "oc2", "hlc3", "hl2", "ohlc4")] == [12, 11, pytest.approx(34 / 3), 11, 11]

    def test_heikin_ashi(self):
        ha = heikin_ashi([C(0, 10, 14, 8, 12), C(1, 12, 15, 11, 14)])
        assert ha[0].open == 11 and ha[0].close == 11
        assert ha[1].open == 11 and ha[1].close == 13 and ha[1].high == 15 and ha[1].low == 11


class TestDerivatives:
    def test_linear_price_has_constant_velocity_and_no_acceleration(self):
        candles = [C(i, 0, 0, 0, 100 + 2 * i) for i in range(60)]
        out = compute(candles, SurgeSettings())["series"]
        assert out["velocity"][-1] == pytest.approx(2)
        assert out["acceleration"][-1] == pytest.approx(0, abs=1e-9)
        assert out["surge"][-1] == pytest.approx(0, abs=1e-9)

    def test_quadratic_price_has_constant_acceleration(self):
        candles = [C(i, 0, 0, 0, 0.5 * i * i) for i in range(80)]
        out = compute(candles, SurgeSettings())["series"]
        assert out["acceleration"][-1] == pytest.approx(1)
        assert out["surge"][-1] == pytest.approx(0, abs=1e-9)

    def test_warmup_and_first_value(self):
        st = SurgeSettings()
        s = compute([C(i, 0, 0, 0, i * i * i) for i in range(40)], st)["series"]["surge"]
        first = next(i for i, x in enumerate(s) if x is not None)
        # d needs 5 bars, each diff+MA adds 5 more: first surge value at index 4 + 3*5 = 19
        assert first == 19 and first < st.warmup

    def test_diff(self):
        assert diff([None, 1, 3, 6]) == [None, None, 2, 3]


class TestPeaks:
    def test_min_spread_and_spike(self):
        xs = [0, 1, 0, 1, 0, 2, 0, -1, 0, -1, 0]
        marks = peaks_troughs(xs, min_spread=3, multiplier=10)
        # trough at 9 is only 2 bars after the one at 7, so it is skipped
        assert [(m["index"], m["kind"]) for m in marks] == [(1, "peak"), (2, "trough"), (5, "peak"), (7, "trough"), (8, "peak")]
        assert marks[2]["spike"] == 20

    def test_describe_zero_crossings(self):
        r = describe({"distance": [1, 2], "velocity": [-1, 0.5], "acceleration": [1, -2], "surge": [None, None]})
        assert r["velocity"]["crossed_zero"] == "up" and r["acceleration"]["crossed_zero"] == "down"
        assert "surge" not in r and r["distance"]["crossed_zero"] is None

    def test_settings_validation(self):
        assert SurgeSettings().validate() is None
        assert SurgeSettings(period_d=2).validate() and SurgeSettings(price_type="x").validate()
        assert SurgeSettings(ma_type="sma").validate() and SurgeSettings(alma_sigma=0).validate()
