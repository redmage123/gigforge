"""SurgeX: successive smoothed derivatives of price — distance, velocity, acceleration, surge.

Port of the TradingView "SurgeX" indicator (Pine v5):

    p = price (close, oc/2, hlc/3, hl/2 or ohlc/4; optionally from Heikin Ashi candles)
    d = MA(p, D)                 distance
    v = MA(d - d[1], V)          velocity
    a = MA(v - v[1], A)          acceleration
    s = MA(a - a[1], S)          surge (jerk)

MA is Pine's WMA or ALMA, implemented exactly as Pine defines them so values match the chart.
A series value is None until it has enough history (Pine's `na`).

Peaks and troughs: the pasted script was cut off before its peak/trough code, so this follows the
inputs' evident intent: a local high (low) of the plotted series, confirmed one bar later, at least
`min_spread` bars after the previous peak (trough). `spike` is the series value times the spike
multiplier, for drawing exaggerated markers on small-valued series.
"""

import math
from dataclasses import dataclass

from services.market.models import Candle

PRICE_TYPES = ("close", "oc2", "hlc3", "hl2", "ohlc4")  # Pine pType 0..4
PLOT_TYPES = ("distance", "velocity", "acceleration", "surge")
MA_TYPES = ("wma", "alma")


@dataclass(frozen=True)
class SurgeSettings:
    heikin_ashi: bool = False
    price_type: str = "close"
    plot_type: str = "surge"
    ma_type: str = "wma"
    period_d: int = 5
    period_v: int = 5
    period_a: int = 5
    period_s: int = 5
    alma_offset: float = 2.0  # Pine AlmaOffset1 (ALMA "offset")
    alma_sigma: float = 1.0  # Pine AlmaOffset2 (ALMA "sigma")
    min_spread: int = 3
    spike_multiplier: int = 1

    def validate(self) -> str | None:
        if self.price_type not in PRICE_TYPES:
            return f"price_type must be one of {', '.join(PRICE_TYPES)}"
        if self.plot_type not in PLOT_TYPES:
            return f"plot_type must be one of {', '.join(PLOT_TYPES)}"
        if self.ma_type not in MA_TYPES:
            return "ma_type must be wma or alma"
        if any(not 3 <= n <= 200 for n in (self.period_d, self.period_v, self.period_a, self.period_s)):
            return "moving-average periods must be 3-200"
        if self.alma_sigma <= 0:
            return "ALMA sigma must be positive"
        if not 1 <= self.min_spread <= 500 or not 1 <= self.spike_multiplier <= 1_000_000:
            return "peak spread must be 1-500 and spike multiplier 1-1,000,000"
        return None

    @property
    def warmup(self) -> int:
        """Bars before the surge series has its first value."""
        return self.period_d + self.period_v + self.period_a + self.period_s


def heikin_ashi(candles: list[Candle]) -> list[Candle]:
    """Heikin Ashi candles (as TradingView's ticker.heikinashi)."""
    out: list[Candle] = []
    for i, c in enumerate(candles):
        ha_close = (c.open + c.high + c.low + c.close) / 4
        ha_open = (c.open + c.close) / 2 if i == 0 else (out[-1].open + out[-1].close) / 2
        out.append(Candle(c.open_time, ha_open, max(c.high, ha_open, ha_close), min(c.low, ha_open, ha_close),
                          ha_close, c.quote_volume))
    return out


def price_series(candles: list[Candle], price_type: str) -> list[float]:
    f = {
        "close": lambda c: c.close,
        "oc2": lambda c: (c.open + c.close) / 2,
        "hlc3": lambda c: (c.high + c.low + c.close) / 3,
        "hl2": lambda c: (c.high + c.low) / 2,
        "ohlc4": lambda c: (c.open + c.high + c.low + c.close) / 4,
    }[price_type]
    return [f(c) for c in candles]


def wma(xs: list[float | None], n: int) -> list[float | None]:
    """Pine ta.wma: weights n (newest) .. 1 (oldest); None until n non-None values are available."""
    out: list[float | None] = []
    denom = n * (n + 1) / 2
    for i in range(len(xs)):
        window = xs[i - n + 1:i + 1] if i >= n - 1 else []
        if len(window) < n or any(x is None for x in window):
            out.append(None)
            continue
        out.append(sum(x * (k + 1) for k, x in enumerate(window)) / denom)
    return out


def alma(xs: list[float | None], n: int, offset: float, sigma: float) -> list[float | None]:
    """Pine ta.alma: Gaussian weights centred at offset*(n-1), width n/sigma."""
    m = offset * (n - 1)
    s = n / sigma
    weights = [math.exp(-((i - m) ** 2) / (2 * s * s)) for i in range(n)]
    norm = sum(weights)
    out: list[float | None] = []
    for i in range(len(xs)):
        window = xs[i - n + 1:i + 1] if i >= n - 1 else []
        if len(window) < n or any(x is None for x in window):
            out.append(None)
            continue
        # Pine: sum += series[n - i - 1] * weight[i]  ->  weight i applies to the i-th oldest value
        out.append(sum(window[k] * weights[k] for k in range(n)) / norm)
    return out


def diff(xs: list[float | None]) -> list[float | None]:
    return [None if i == 0 or xs[i] is None or xs[i - 1] is None else xs[i] - xs[i - 1] for i in range(len(xs))]


def peaks_troughs(xs: list[float | None], min_spread: int, multiplier: int = 1) -> list[dict]:
    """Local highs/lows (confirmed by the next bar), each at least `min_spread` bars after the last of its kind."""
    marks: list[dict] = []
    last = {"peak": -10**9, "trough": -10**9}
    for i in range(1, len(xs) - 1):
        a, b, c = xs[i - 1], xs[i], xs[i + 1]
        if None in (a, b, c):
            continue
        kind = "peak" if b > a and b >= c else "trough" if b < a and b <= c else None
        if kind and i - last[kind] >= min_spread:
            marks.append({"index": i, "kind": kind, "value": b, "spike": b * multiplier})
            last[kind] = i
    return marks


def compute(candles: list[Candle], st: SurgeSettings) -> dict:
    """All four series, the plotted one, and its peaks/troughs, aligned with `candles`."""
    src = heikin_ashi(candles) if st.heikin_ashi else candles
    p = price_series(src, st.price_type)
    ma = (lambda xs, n: wma(xs, n)) if st.ma_type == "wma" else (lambda xs, n: alma(xs, n, st.alma_offset, st.alma_sigma))
    d = ma(p, st.period_d)
    v = ma(diff(d), st.period_v)
    a = ma(diff(v), st.period_a)
    s = ma(diff(a), st.period_s)
    series = {"distance": d, "velocity": v, "acceleration": a, "surge": s}
    plotted = series[st.plot_type]
    return {"series": series, "plotted": plotted, "marks": peaks_troughs(plotted, st.min_spread, st.spike_multiplier),
            "reading": describe(series)}


def describe(series: dict) -> dict:
    """Plain-language state at the last bar: direction of each derivative and recent zero crossings."""
    def last_two(xs):
        vals = [x for x in xs if x is not None]
        return (vals[-2], vals[-1]) if len(vals) >= 2 else (None, vals[-1] if vals else None)

    out = {}
    for name, xs in series.items():
        prev, cur = last_two(xs)
        if cur is None:
            continue
        crossed = None
        if prev is not None and name != "distance":
            if prev <= 0 < cur:
                crossed = "up"
            elif prev >= 0 > cur:
                crossed = "down"
        out[name] = {"value": cur, "rising": prev is not None and cur > prev, "crossed_zero": crossed}
    return out
