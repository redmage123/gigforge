"""Blockchain visualization charts — Bokeh (JSON for client-side embedding)."""

from bokeh.plotting import figure
from bokeh.embed import json_item
from bokeh.models import ColumnDataSource
from services.blockchain.ethereum import EVMClient
from config import EVM_CHAINS, COLORS


async def gas_comparison_chart() -> dict:
    """Bokeh bar chart comparing gas prices across EVM chains."""
    chains = []
    gas_prices = []
    bar_colors = []
    palette = [COLORS["primary"], COLORS["secondary"], COLORS["info"],
               COLORS["warning"], COLORS["accent"], "#ff9ff3", "#48dbfb"]

    for i, chain in enumerate(EVM_CHAINS):
        try:
            client = EVMClient(chain)
            gas = await client.get_gas_price()
            chains.append(chain.title())
            gas_prices.append(gas["gas_gwei"])
            bar_colors.append(palette[i % len(palette)])
        except Exception:
            chains.append(chain.title())
            gas_prices.append(0)
            bar_colors.append(palette[i % len(palette)])

    source = ColumnDataSource(data=dict(chains=chains, gas=gas_prices, colors=bar_colors))
    p = figure(x_range=chains, height=350, title="Gas Prices (Gwei)",
               toolbar_location=None, tools="",
               background_fill_color=COLORS["bg"],
               border_fill_color=COLORS["bg"])
    p.vbar(x="chains", top="gas", width=0.7, source=source, color="colors", alpha=0.8)
    p.title.text_color = COLORS["text"]
    p.xaxis.major_label_text_color = COLORS["muted"]
    p.yaxis.major_label_text_color = COLORS["muted"]
    p.xgrid.grid_line_color = None
    p.ygrid.grid_line_alpha = 0.2

    return json_item(p, "gas-chart")


async def whale_activity_chart() -> dict:
    """Bokeh scatter chart for whale activity (placeholder with block data)."""
    blocks = []
    tx_counts = []
    gas_used = []

    client = EVMClient("ethereum")
    try:
        block = await client.get_latest_block()
        # Show last block stats as single point (expand with historical data later)
        blocks.append(block["number"])
        tx_counts.append(block["transactions"])
        gas_used.append(block["gas_used"] / 1e6)
    except Exception:
        blocks.append(0)
        tx_counts.append(0)
        gas_used.append(0)

    source = ColumnDataSource(data=dict(block=blocks, txs=tx_counts, gas=gas_used))
    p = figure(height=350, title="Latest Block Activity",
               toolbar_location=None, tools="hover",
               background_fill_color=COLORS["bg"],
               border_fill_color=COLORS["bg"])
    p.scatter("block", "txs", size=15, source=source,
              color=COLORS["primary"], alpha=0.8)
    p.title.text_color = COLORS["text"]
    p.xaxis.axis_label = "Block Number"
    p.yaxis.axis_label = "Transactions"
    p.xaxis.major_label_text_color = COLORS["muted"]
    p.yaxis.major_label_text_color = COLORS["muted"]
    p.xaxis.axis_label_text_color = COLORS["text"]
    p.yaxis.axis_label_text_color = COLORS["text"]

    return json_item(p, "whale-chart")
