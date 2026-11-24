"""RSI and Stochastic RSI, computed the way TradingView does.

RSI uses Wilder's smoothing (an RMA seeded with the simple average of the first `period` changes).
Stochastic RSI is the stochastic of RSI over `stoch_period`, with %K = SMA(stoch, k) and %D = SMA(%K, d).
Every series is aligned with the input: values before an indicator has warmed up are None.
"""

from dataclasses import dataclass

Series = list[float | None]


def rsi(closes: list[float], period: int = 14) -> Series:
    out: Series = [None] * len(closes)
    if period < 1 or len(closes) <= period:
        return out
    gains = losses = 0.0
    for i in range(1, period + 1):
        ch = closes[i] - closes[i - 1]
        gains += max(ch, 0.0)
        losses += max(-ch, 0.0)
    avg_g, avg_l = gains / period, losses / period
    out[period] = _rsi_value(avg_g, avg_l)
    for i in range(period + 1, len(closes)):
        ch = closes[i] - closes[i - 1]
        avg_g = (avg_g * (period - 1) + max(ch, 0.0)) / period
        avg_l = (avg_l * (period - 1) + max(-ch, 0.0)) / period
        out[i] = _rsi_value(avg_g, avg_l)
    return out


def _rsi_value(avg_gain: float, avg_loss: float) -> float:
    if avg_loss == 0:
        return 100.0 if avg_gain > 0 else 50.0  # flat price: neither overbought nor oversold
    return 100.0 - 100.0 / (1.0 + avg_gain / avg_loss)


def sma(xs: Series, n: int) -> Series:
    """Simple moving average; None until `n` consecutive values exist."""
    out: Series = [None] * len(xs)
    for i in range(n - 1, len(xs)):
        window = xs[i - n + 1:i + 1]
        if all(v is not None for v in window):
            out[i] = sum(window) / n
    return out


def stochastic(xs: Series, n: int) -> Series:
    """(x - lowest) / (highest - lowest) * 100 over the last `n` values."""
    out: Series = [None] * len(xs)
    for i in range(n - 1, len(xs)):
        window = xs[i - n + 1:i + 1]
        if any(v is None for v in window):
            continue
        lo, hi = min(window), max(window)
        out[i] = 50.0 if hi == lo else (xs[i] - lo) / (hi - lo) * 100.0
    return out


@dataclass(frozen=True)
class OscSettings:
    rsi_period: int = 14
    stoch_period: int = 14   # stochastic look-back applied to RSI
    k: int = 3               # %K smoothing
    d: int = 3               # %D smoothing

    def validate(self) -> str | None:
        if not 2 <= self.rsi_period <= 100 or not 2 <= self.stoch_period <= 100:
            return "RSI and stochastic periods must be 2-100"
        if not 1 <= self.k <= 20 or not 1 <= self.d <= 20:
            return "%K and %D smoothing must be 1-20"
        return None

    @property
    def warmup(self) -> int:
        """Bars needed before Stochastic RSI %D has a value; RSI itself needs `rsi_period`.

        Wilder smoothing keeps a memory of earlier bars, so a few times the period is added to let
        the values settle to what a chart with a longer history would show.
        """
        return self.rsi_period * 4 + self.stoch_period + self.k + self.d


def stoch_rsi(closes: list[float], st: OscSettings = OscSettings()) -> tuple[Series, Series, Series]:
    """(rsi, %K, %D)."""
    r = rsi(closes, st.rsi_period)
    k = sma(stochastic(r, st.stoch_period), st.k)
    return r, k, sma(k, st.d)
