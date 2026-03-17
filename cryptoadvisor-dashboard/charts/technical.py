"""Technical analysis charts — matplotlib (base64) + plotly (JSON)."""

import base64
import io
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import plotly.graph_objects as go
from services.coingecko import get_ohlcv, get_market_chart
from config import COLORS


async def candlestick_chart(coin_id: str, days: int = 30) -> go.Figure:
    """Plotly candlestick with SMA overlays."""
    data = await get_ohlcv(coin_id, days)
    df = pd.DataFrame(data, columns=["timestamp", "open", "high", "low", "close"])
    df["date"] = pd.to_datetime(df["timestamp"], unit="ms")
    df["sma7"] = df["close"].rolling(7).mean()
    df["sma25"] = df["close"].rolling(25).mean()

    fig = go.Figure()
    fig.add_trace(go.Candlestick(
        x=df["date"], open=df["open"], high=df["high"],
        low=df["low"], close=df["close"], name="OHLC",
    ))
    fig.add_trace(go.Scatter(x=df["date"], y=df["sma7"], name="SMA 7",
                             line=dict(color=COLORS["primary"], width=1)))
    fig.add_trace(go.Scatter(x=df["date"], y=df["sma25"], name="SMA 25",
                             line=dict(color=COLORS["secondary"], width=1)))
    fig.update_layout(
        template="plotly_dark",
        paper_bgcolor=COLORS["bg"],
        plot_bgcolor=COLORS["bg"],
        xaxis_rangeslider_visible=False,
        title=f"{coin_id.title()} — {days}d",
    )
    return fig


def _to_base64(fig) -> str:
    buf = io.BytesIO()
    fig.savefig(buf, format="png", bbox_inches="tight", facecolor=COLORS["bg"], dpi=150)
    plt.close(fig)
    buf.seek(0)
    return base64.b64encode(buf.read()).decode()


async def rsi_chart(coin_id: str, period: int = 14) -> str:
    """RSI indicator as base64 PNG."""
    data = await get_market_chart(coin_id, 60)
    prices = [p[1] for p in data["prices"]]
    deltas = np.diff(prices)
    gains = np.where(deltas > 0, deltas, 0)
    losses = np.where(deltas < 0, -deltas, 0)

    avg_gain = pd.Series(gains).rolling(period).mean()
    avg_loss = pd.Series(losses).rolling(period).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    rsi = 100 - (100 / (1 + rs))

    fig, ax = plt.subplots(figsize=(8, 4))
    ax.plot(rsi.values, color=COLORS["primary"], linewidth=1.5)
    ax.axhline(70, color=COLORS["accent"], linestyle="--", alpha=0.7)
    ax.axhline(30, color=COLORS["info"], linestyle="--", alpha=0.7)
    ax.fill_between(range(len(rsi)), 30, 70, alpha=0.05, color=COLORS["text"])
    ax.set_facecolor(COLORS["bg"])
    ax.set_title(f"{coin_id.title()} RSI ({period})", color=COLORS["text"])
    ax.tick_params(colors=COLORS["muted"])
    ax.set_ylim(0, 100)
    return _to_base64(fig)


async def macd_chart(coin_id: str) -> str:
    """MACD indicator as base64 PNG."""
    data = await get_market_chart(coin_id, 90)
    prices = pd.Series([p[1] for p in data["prices"]])
    ema12 = prices.ewm(span=12).mean()
    ema26 = prices.ewm(span=26).mean()
    macd = ema12 - ema26
    signal = macd.ewm(span=9).mean()
    histogram = macd - signal

    fig, ax = plt.subplots(figsize=(8, 4))
    ax.plot(macd.values, color=COLORS["primary"], linewidth=1.5, label="MACD")
    ax.plot(signal.values, color=COLORS["accent"], linewidth=1.5, label="Signal")
    colors = [COLORS["info"] if v >= 0 else COLORS["accent"] for v in histogram.values]
    ax.bar(range(len(histogram)), histogram.values, color=colors, alpha=0.5)
    ax.set_facecolor(COLORS["bg"])
    ax.set_title(f"{coin_id.title()} MACD (12,26,9)", color=COLORS["text"])
    ax.tick_params(colors=COLORS["muted"])
    ax.legend(facecolor=COLORS["card"], edgecolor=COLORS["muted"], labelcolor=COLORS["text"])
    return _to_base64(fig)


async def bollinger_chart(coin_id: str, period: int = 20, std: int = 2) -> str:
    """Bollinger Bands as base64 PNG."""
    data = await get_market_chart(coin_id, 60)
    prices = pd.Series([p[1] for p in data["prices"]])
    sma = prices.rolling(period).mean()
    std_dev = prices.rolling(period).std()
    upper = sma + std * std_dev
    lower = sma - std * std_dev

    fig, ax = plt.subplots(figsize=(10, 4))
    ax.plot(prices.values, color=COLORS["text"], linewidth=1, label="Price")
    ax.plot(sma.values, color=COLORS["primary"], linewidth=1.5, label=f"SMA {period}")
    ax.plot(upper.values, color=COLORS["accent"], linewidth=1, linestyle="--")
    ax.plot(lower.values, color=COLORS["info"], linewidth=1, linestyle="--")
    ax.fill_between(range(len(prices)), lower.values, upper.values, alpha=0.08, color=COLORS["secondary"])
    ax.set_facecolor(COLORS["bg"])
    ax.set_title(f"{coin_id.title()} Bollinger Bands ({period}, {std}σ)", color=COLORS["text"])
    ax.tick_params(colors=COLORS["muted"])
    ax.legend(facecolor=COLORS["card"], edgecolor=COLORS["muted"], labelcolor=COLORS["text"])
    return _to_base64(fig)
