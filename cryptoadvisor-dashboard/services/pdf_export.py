"""PDF report generator for portfolio summaries using ReportLab."""

import json
import logging
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from typing import Any

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm, mm
from reportlab.platypus import (
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from config import COLORS, DATA_DIR

logger = logging.getLogger(__name__)

# ── Theme colors (dark mode palette from config) ─────────────────────────────

_BG = colors.HexColor(COLORS["bg"])
_CARD = colors.HexColor(COLORS["card"])
_PRIMARY = colors.HexColor(COLORS["primary"])
_SECONDARY = colors.HexColor(COLORS["secondary"])
_ACCENT = colors.HexColor(COLORS["accent"])
_TEXT = colors.HexColor(COLORS["text"])
_MUTED = colors.HexColor(COLORS["muted"])
_WHITE = colors.white


def _load_user_data(username: str) -> dict[str, Any]:
    """Load JSON data files for a user from the data directory."""
    user_dir = DATA_DIR / "users" / username
    result: dict[str, Any] = {
        "portfolio": [],
        "trades": [],
        "settings": {},
    }

    for key, filename in [
        ("portfolio", "portfolio.json"),
        ("trades", "trades.json"),
        ("settings", "settings.json"),
    ]:
        filepath = user_dir / filename
        if filepath.exists():
            try:
                result[key] = json.loads(filepath.read_text())
            except Exception as exc:
                logger.warning("Error reading %s: %s", filepath, exc)

    return result


def _build_styles() -> dict[str, ParagraphStyle]:
    """Build paragraph styles that match the dark dashboard theme."""
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle(
            "DarkTitle",
            parent=base["Title"],
            fontSize=22,
            textColor=_PRIMARY,
            spaceAfter=8 * mm,
        ),
        "heading": ParagraphStyle(
            "DarkHeading",
            parent=base["Heading2"],
            fontSize=14,
            textColor=_PRIMARY,
            spaceBefore=6 * mm,
            spaceAfter=3 * mm,
        ),
        "body": ParagraphStyle(
            "DarkBody",
            parent=base["Normal"],
            fontSize=10,
            textColor=_TEXT,
        ),
        "muted": ParagraphStyle(
            "DarkMuted",
            parent=base["Normal"],
            fontSize=8,
            textColor=_MUTED,
        ),
    }


def _styled_table(data: list[list[str]], col_widths: list[float] | None = None) -> Table:
    """Create a consistently styled table matching the dark theme."""
    table = Table(data, colWidths=col_widths, repeatRows=1)
    style_commands: list[Any] = [
        # Header row
        ("BACKGROUND", (0, 0), (-1, 0), _CARD),
        ("TEXTCOLOR", (0, 0), (-1, 0), _PRIMARY),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 10),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 8),
        ("TOPPADDING", (0, 0), (-1, 0), 8),
        # Body rows
        ("BACKGROUND", (0, 1), (-1, -1), _BG),
        ("TEXTCOLOR", (0, 1), (-1, -1), _TEXT),
        ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 1), (-1, -1), 9),
        ("BOTTOMPADDING", (0, 1), (-1, -1), 5),
        ("TOPPADDING", (0, 1), (-1, -1), 5),
        # Grid
        ("GRID", (0, 0), (-1, -1), 0.5, _MUTED),
        ("ALIGN", (0, 0), (-1, -1), "LEFT"),
        # Alternating row shading
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [_BG, _CARD]),
    ]
    table.setStyle(TableStyle(style_commands))
    return table


def generate_portfolio_report(username: str) -> bytes:
    """Generate a styled PDF portfolio report for the given user.

    Returns raw PDF bytes (can be streamed as a download response).
    """
    try:
        user_data = _load_user_data(username)
        styles = _build_styles()
        buffer = BytesIO()

        doc = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            leftMargin=1.5 * cm,
            rightMargin=1.5 * cm,
            topMargin=1.5 * cm,
            bottomMargin=1.5 * cm,
        )

        elements: list[Any] = []

        # ── Header ─────────────────────────────────────────────────────
        now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
        elements.append(Paragraph("CryptoAdvisor Portfolio Report", styles["title"]))
        elements.append(Paragraph(f"User: {username}  |  Generated: {now}", styles["muted"]))
        elements.append(Spacer(1, 6 * mm))

        # ── Portfolio Summary ──────────────────────────────────────────
        portfolio = user_data.get("portfolio", [])
        if isinstance(portfolio, dict):
            portfolio = portfolio.get("holdings", [])

        elements.append(Paragraph("Portfolio Summary", styles["heading"]))

        if portfolio:
            total_value = 0.0
            table_data = [["Coin", "Amount", "Value (USD)", "% of Portfolio"]]

            for item in portfolio:
                coin = item.get("coin", item.get("symbol", "N/A"))
                amount = item.get("amount", item.get("quantity", 0))
                value = item.get("value", item.get("usd_value", 0))
                total_value += float(value)
                table_data.append([
                    str(coin).upper(),
                    f"{float(amount):.4f}",
                    f"${float(value):,.2f}",
                    "",  # Filled after totals known
                ])

            # Fill percentage column
            for i in range(1, len(table_data)):
                val = float(table_data[i][2].replace("$", "").replace(",", ""))
                pct = (val / total_value * 100) if total_value > 0 else 0
                table_data[i][3] = f"{pct:.1f}%"

            # Total row
            table_data.append(["TOTAL", "", f"${total_value:,.2f}", "100%"])

            elements.append(_styled_table(table_data, col_widths=[4 * cm, 3.5 * cm, 4 * cm, 3.5 * cm]))
        else:
            elements.append(Paragraph("No portfolio data available.", styles["body"]))

        elements.append(Spacer(1, 8 * mm))

        # ── Holdings Breakdown ─────────────────────────────────────────
        elements.append(Paragraph("Holdings Breakdown", styles["heading"]))

        if portfolio:
            breakdown_data = [["Coin", "Amount", "Avg Cost", "Current Price", "P/L"]]
            for item in portfolio:
                coin = str(item.get("coin", item.get("symbol", "N/A"))).upper()
                amount = float(item.get("amount", item.get("quantity", 0)))
                avg_cost = item.get("avg_cost", item.get("average_price", 0))
                current = item.get("current_price", item.get("price", 0))
                pnl = (float(current) - float(avg_cost)) * amount if avg_cost else 0

                breakdown_data.append([
                    coin,
                    f"{amount:.4f}",
                    f"${float(avg_cost):,.2f}" if avg_cost else "N/A",
                    f"${float(current):,.2f}" if current else "N/A",
                    f"${pnl:+,.2f}" if avg_cost else "N/A",
                ])
            elements.append(_styled_table(
                breakdown_data,
                col_widths=[3 * cm, 3 * cm, 3 * cm, 3 * cm, 3 * cm],
            ))
        else:
            elements.append(Paragraph("No holdings data available.", styles["body"]))

        elements.append(Spacer(1, 8 * mm))

        # ── Recent Trades ──────────────────────────────────────────────
        elements.append(Paragraph("Recent Trades", styles["heading"]))

        trades = user_data.get("trades", [])
        if isinstance(trades, dict):
            trades = trades.get("trades", [])

        if trades:
            trade_data = [["Date", "Coin", "Type", "Amount", "Price", "Total"]]
            for trade in trades[-20:]:  # Last 20 trades
                coin = str(trade.get("coin", "N/A")).upper()
                t_type = trade.get("type", "N/A")
                amount = float(trade.get("amount", 0))
                price = float(trade.get("price", 0))
                total = amount * price
                date = trade.get("date", "N/A")

                trade_data.append([
                    str(date)[:10],
                    coin,
                    t_type.upper(),
                    f"{amount:.4f}",
                    f"${price:,.2f}",
                    f"${total:,.2f}",
                ])
            elements.append(_styled_table(
                trade_data,
                col_widths=[2.5 * cm, 2.5 * cm, 2 * cm, 2.5 * cm, 3 * cm, 3 * cm],
            ))
        else:
            elements.append(Paragraph("No trade history available.", styles["body"]))

        elements.append(Spacer(1, 8 * mm))

        # ── P&L Summary ───────────────────────────────────────────────
        elements.append(Paragraph("P&L Summary", styles["heading"]))

        if portfolio:
            total_invested = 0.0
            total_current = 0.0
            for item in portfolio:
                amt = float(item.get("amount", item.get("quantity", 0)))
                avg = float(item.get("avg_cost", item.get("average_price", 0)) or 0)
                cur = float(item.get("current_price", item.get("price", 0)) or 0)
                total_invested += amt * avg
                total_current += amt * cur

            net_pnl = total_current - total_invested
            pnl_pct = (net_pnl / total_invested * 100) if total_invested > 0 else 0

            pnl_data = [
                ["Metric", "Value"],
                ["Total Invested", f"${total_invested:,.2f}"],
                ["Current Value", f"${total_current:,.2f}"],
                ["Net P/L", f"${net_pnl:+,.2f}"],
                ["P/L %", f"{pnl_pct:+.2f}%"],
            ]
            elements.append(_styled_table(pnl_data, col_widths=[6 * cm, 6 * cm]))
        else:
            elements.append(Paragraph("No data to compute P&L.", styles["body"]))

        # ── Footer ─────────────────────────────────────────────────────
        elements.append(Spacer(1, 12 * mm))
        elements.append(Paragraph(
            "This report is for informational purposes only and does not constitute financial advice.",
            styles["muted"],
        ))

        doc.build(elements)
        return buffer.getvalue()

    except Exception as exc:
        logger.error("Error generating PDF report for %s: %s", username, exc)
        # Return a minimal error PDF so callers don't crash
        buffer = BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=A4)
        doc.build([Paragraph(
            f"Error generating report: {exc}",
            getSampleStyleSheet()["Normal"],
        )])
        return buffer.getvalue()
