"""Analytics charts — seaborn heatmap, plotly sunburst, matplotlib scatter."""

import base64
import io
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
import plotly.graph_objects as go
from services.coingecko import get_market_chart
from services.memory import get_portfolio
from config import DEFAULT_COINS, COLORS


async def correlation_heatmap() -> str:
    """Seaborn correlation heatmap of default coins as base64 PNG."""
    price_data = {}
    for coin in DEFAULT_COINS:
        try:
            data = await get_market_chart(coin, 30)
            price_data[coin] = [p[1] for p in data["prices"]]
        except Exception:
            continue

    if len(price_data) < 2:
        return ""

    # Align lengths
    min_len = min(len(v) for v in price_data.values())
    df = pd.DataFrame({k: v[:min_len] for k, v in price_data.items()})
    returns = df.pct_change().dropna()
    corr = returns.corr()

    fig, ax = plt.subplots(figsize=(8, 6))
    sns.heatmap(
        corr, annot=True, fmt=".2f", cmap="RdYlGn", center=0,
        ax=ax, square=True, linewidths=0.5,
        cbar_kws={"shrink": 0.8},
    )
    ax.set_facecolor(COLORS["bg"])
    fig.patch.set_facecolor(COLORS["bg"])
    ax.set_title("30d Return Correlation", color=COLORS["text"], fontsize=14)
    ax.tick_params(colors=COLORS["text"])
    plt.setp(ax.get_xticklabels(), color=COLORS["text"])
    plt.setp(ax.get_yticklabels(), color=COLORS["text"])

    buf = io.BytesIO()
    fig.savefig(buf, format="png", bbox_inches="tight", facecolor=COLORS["bg"], dpi=100)
    plt.close(fig)
    buf.seek(0)
    return base64.b64encode(buf.read()).decode()


async def return_distributions() -> str:
    """Seaborn KDE return distributions as base64 PNG."""
    fig, ax = plt.subplots(figsize=(10, 5))
    for coin in DEFAULT_COINS[:5]:
        try:
            data = await get_market_chart(coin, 30)
            prices = pd.Series([p[1] for p in data["prices"]])
            returns = prices.pct_change().dropna()
            sns.kdeplot(returns, ax=ax, label=coin.title(), fill=True, alpha=0.3)
        except Exception:
            continue

    ax.set_facecolor(COLORS["bg"])
    fig.patch.set_facecolor(COLORS["bg"])
    ax.set_title("Return Distributions (30d)", color=COLORS["text"])
    ax.tick_params(colors=COLORS["muted"])
    ax.legend(facecolor=COLORS["card"], edgecolor=COLORS["muted"], labelcolor=COLORS["text"])

    buf = io.BytesIO()
    fig.savefig(buf, format="png", bbox_inches="tight", facecolor=COLORS["bg"], dpi=100)
    plt.close(fig)
    buf.seek(0)
    return base64.b64encode(buf.read()).decode()


async def portfolio_sunburst() -> go.Figure:
    """Plotly sunburst chart of portfolio allocation."""
    portfolio = get_portfolio()
    holdings = portfolio.get("holdings", [])

    if not holdings:
        # Demo data
        holdings = [
            {"Asset": "Bitcoin", "Value": "45000"},
            {"Asset": "Ethereum", "Value": "25000"},
            {"Asset": "Solana", "Value": "15000"},
            {"Asset": "Cardano", "Value": "10000"},
            {"Asset": "Polkadot", "Value": "5000"},
        ]

    labels = []
    values = []
    parents = []
    for h in holdings:
        name = h.get("Asset", h.get("asset", h.get("Coin", "Unknown")))
        val = float(str(h.get("Value", h.get("value", "0"))).replace("$", "").replace(",", ""))
        labels.append(name)
        values.append(val)
        parents.append("Portfolio")

    labels.insert(0, "Portfolio")
    values.insert(0, sum(values[0:]))
    parents.insert(0, "")

    fig = go.Figure(go.Sunburst(
        labels=labels, parents=parents, values=values,
        branchvalues="total",
        marker=dict(colors=[COLORS["bg"]] + [COLORS["primary"], COLORS["secondary"],
                    COLORS["info"], COLORS["warning"], COLORS["accent"]][:len(labels)-1]),
    ))
    fig.update_layout(
        template="plotly_dark",
        paper_bgcolor=COLORS["bg"],
        plot_bgcolor=COLORS["bg"],
        title="Portfolio Allocation",
    )
    return fig
