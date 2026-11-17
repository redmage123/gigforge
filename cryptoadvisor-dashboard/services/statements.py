"""Portfolio statements (PDF): performance vs benchmark, holdings, allocation, activity for a period.

On demand for any date range, and generated automatically after each month end for every portfolio
with activity; stored under data/statements/<owner>/<portfolio>/<YYYY-MM>.pdf and listed for the
owner and anyone the portfolio is shared with.
"""

import calendar
import re
from xml.sax.saxutils import escape
from datetime import date, datetime, timedelta, timezone
from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from services import cash as cash_ledger
from services import portfolios
from services.performance import performance
from services.trades import get_trades
from services import store, user_data

INK, MUTED, RULE, ACCENT = colors.HexColor("#1f2430"), colors.HexColor("#5b6472"), colors.HexColor("#d9dde3"), colors.HexColor("#2f5bea")
POS, NEG = colors.HexColor("#147a4b"), colors.HexColor("#b42318")
_ss = getSampleStyleSheet()
H1 = ParagraphStyle("h1", parent=_ss["Title"], alignment=0, fontSize=18, textColor=INK, spaceAfter=2)
H2 = ParagraphStyle("h2", parent=_ss["Heading2"], fontSize=11.5, textColor=INK, spaceBefore=10, spaceAfter=4)
BODY = ParagraphStyle("b", parent=_ss["BodyText"], fontSize=8.5, textColor=INK, leading=11)
SMALL = ParagraphStyle("s", parent=BODY, fontSize=7.5, textColor=MUTED, leading=9.5)


def _usd(v, sign=False):
    if v is None:
        return "–"
    s = f"{'-' if v < 0 else '+' if sign and v > 0 else ''}${abs(v):,.2f}"
    return s


def _pct(v):
    return "–" if v is None else f"{v:+.2f}%"


def _table(rows, widths, num_cols=(), header=True):
    t = Table(rows, colWidths=widths, repeatRows=1 if header else 0)
    style = [("FONT", (0, 0), (-1, -1), "Helvetica", 8), ("TEXTCOLOR", (0, 0), (-1, -1), INK),
             ("LINEBELOW", (0, 0), (-1, -1), 0.3, RULE), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
             ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3)]
    if header:
        style += [("FONT", (0, 0), (-1, 0), "Helvetica-Bold", 7.5), ("TEXTCOLOR", (0, 0), (-1, 0), MUTED),
                  ("LINEBELOW", (0, 0), (-1, 0), 0.8, INK)]
    for c in num_cols:
        style.append(("ALIGN", (c, 0), (c, -1), "RIGHT"))
    t.setStyle(TableStyle(style))
    return t


def _tone(table, rows, col, start=1):
    for i, r in enumerate(rows[start:], start=start):
        txt = str(r[col])
        if txt.startswith("+"):
            table.setStyle(TableStyle([("TEXTCOLOR", (col, i), (col, i), POS)]))
        elif txt.startswith("-"):
            table.setStyle(TableStyle([("TEXTCOLOR", (col, i), (col, i), NEG)]))


async def build_pdf(owner: str, pid: str, first_day: date, end: date, prepared_by: str = "") -> bytes:
    """Statement covering first_day..end; returns are measured from the close of the day before."""
    from services.allocation import analyze

    start = first_day - timedelta(days=1)

    rec = portfolios.get_own(owner, pid)
    if not rec:
        raise portfolios.AccessError("Portfolio not found", 404)
    perf = await performance(owner, [pid], rec.get("benchmark") or "index:SPX", today=end, start=start)
    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=16 * mm, rightMargin=16 * mm, topMargin=14 * mm, bottomMargin=16 * mm,
                            title=f"{rec['name']} statement {first_day} to {end}", author="AssetAdvisor")
    W = A4[0] - 32 * mm
    story = [Paragraph("Portfolio statement", H1),
             Paragraph(f"<b>{escape(rec['name'])}</b>" + (f" · {escape(rec['client_name'])}" if rec.get("client_name") else "")
                       + f" · {first_day:%d %b %Y} to {end:%d %b %Y}", BODY),
             Paragraph(f"Generated {datetime.now(timezone.utc):%d %b %Y %H:%M} UTC"
                       + (f" · prepared by {escape(prepared_by)}" if prepared_by else "") + " · amounts in USD", SMALL),
             Spacer(1, 8)]
    if perf.get("empty"):
        story.append(Paragraph("No activity in this portfolio yet.", BODY))
        doc.build(story)
        return buf.getvalue()

    gain = perf["nav"] - perf["start_nav"] - perf["net_deposits"]
    summary = [[f"Value at {start:%d %b %Y} close", _usd(perf["start_nav"])], ["Deposits less withdrawals", _usd(perf["net_deposits"], sign=True)],
               ["Investment gain or loss", _usd(gain, sign=True)], ["  of which dividends and interest less fees", _usd(perf["income_in_period"], sign=True)],
               ["Value at end", _usd(perf["nav"])], ["  of which cash", _usd(perf["cash"])]]
    ret = [["Time-weighted return", _pct(perf["twr_pct"])],
           [f"Benchmark: {perf['benchmark_name']}", _pct(perf["benchmark_pct"])],
           ["Difference", _pct(perf["excess_pct"])],
           ["Money-weighted return (annual)", _pct(perf["mwr_annual_pct"])]]
    if perf.get("twr_annualized_pct") is not None:
        ret.insert(1, ["  annualized", _pct(perf["twr_annualized_pct"])])
    t1, t2 = _table(summary, [W * 0.32, W * 0.16], (1,), header=False), _table(ret, [W * 0.34, W * 0.14], (1,), header=False)
    for t, rows in ((t1, summary), (t2, ret)):
        _tone(t, rows, 1, start=0)
    t1.setStyle(TableStyle([("FONT", (0, 4), (-1, 4), "Helvetica-Bold", 8.5)]))
    story += [Paragraph("Summary", H2), Table([[t1, t2]], colWidths=[W * 0.5, W * 0.5], style=[("VALIGN", (0, 0), (-1, -1), "TOP"),
                                                                                              ("LEFTPADDING", (0, 0), (-1, -1), 0)])]

    months = [m for m in perf["monthly"] if f"{first_day:%Y-%m}" <= m["month"] <= f"{end:%Y-%m}"]
    if len(months) > 1:
        rows = [["Month", "Portfolio", "Benchmark"]] + [[m["month"], _pct(m["return_pct"]), _pct(m["benchmark_pct"])] for m in reversed(months)]
        t = _table(rows, [W * 0.2, W * 0.15, W * 0.15], (1, 2))
        _tone(t, rows, 1), _tone(t, rows, 2)
        story += [Paragraph("Monthly returns", H2), t]

    nav = perf["nav"] or 1
    rows = [["Instrument", "Class", "Quantity", "Price", "Value", "Weight"]]
    for h in perf["holdings"]:
        val = h["open_pnl"] if h["kind"] == "futures" else h["value"]
        rows.append([Paragraph(f"<b>{escape(h['symbol'])}</b> <font color='#5b6472'>{escape(h['name'][:40])}</font>", BODY), h["asset_class"],
                     f"{h['quantity']:,.6g}", f"{h['price']:,.6g}" if h["price"] is not None else "–",
                     _usd(val) + (" P&L" if h["kind"] == "futures" else ""),
                     f"{(h['value'] or 0) / nav * 100:.1f}%" + (" notional" if h["kind"] == "futures" else "")])
    rows.append(["Cash", "", "", "", _usd(perf["cash"]), f"{perf['cash'] / nav * 100:.1f}%"])
    story += [KeepTogether([Paragraph(f"Holdings at {end:%d %b %Y}", H2), _table(rows, [W * .36, W * .1, W * .12, W * .12, W * .15, W * .15], (2, 3, 4, 5))])]

    if rec.get("targets") and end >= datetime.now(timezone.utc).date() - timedelta(days=3):
        a = await analyze(owner, pid)  # targets compare against current weights, so only for current statements
        rows = [["Allocation", "Target", "Current", "Drift"]] + [
            [r["symbol"], f"{r['target_pct']:.1f}%", f"{r['current_pct']:.1f}%", f"{r['drift_pct']:+.1f} pts" + (" ⚠" if r["breach"] else "")]
            for r in a["rows"]]
        story += [Paragraph(f"Allocation vs targets (drift band ±{a['threshold']:g} pts)", H2), _table(rows, [W * .3, W * .14, W * .14, W * .16], (1, 2, 3))]

    tr = [t for t in get_trades(owner, [pid]) if start < date.fromisoformat(t["date"][:10]) <= end]
    ce = [e for e in cash_ledger.get_entries(owner, [pid]) if start < date.fromisoformat(e["date"]) <= end]
    acts = sorted([(t["date"][:10], f"{t['side'].upper()} {t['quantity']:,.6g} {t['instrument_id'].split(':', 1)[1]} @ {t['price']:,.6g}",
                    _usd(t.get("fee") or 0) if t.get("fee") else "") for t in tr]
                  + [(e["date"], f"{e['type'].capitalize()}" + (f" · {e['notes']}" if e.get("notes") else ""), _usd(cash_ledger.signed(e), sign=True))
                     for e in ce])
    story.append(Paragraph(f"Activity ({len(acts)})", H2))
    if acts:
        rows = [["Date", "Transaction", "Cash / fee"]] + [list(a) for a in acts[:400]]
        story.append(_table(rows, [W * 0.15, W * 0.62, W * 0.2], (2,)))
        if len(acts) > 400:
            story.append(Paragraph(f"…and {len(acts) - 400} more (export the trade journal for the full list).", SMALL))
    else:
        story.append(Paragraph("No trades or cash movements in this period.", BODY))

    story += [Spacer(1, 10), Paragraph(
        "Time-weighted return removes the effect of deposits and withdrawals and is the standard measure of how the "
        "investments performed; money-weighted return reflects the timing of the money added and taken out. "
        + " ".join(perf["notes"]) + " Prices: Binance (crypto) and Yahoo Finance (other markets, about 15 minutes delayed, unofficial). "
        "This statement is generated from the records kept in AssetAdvisor; it is not a custodian or broker statement "
        "and not investment advice.", SMALL)]

    def footer(canvas, d):
        canvas.saveState()
        canvas.setFont("Helvetica", 7)
        canvas.setFillColor(MUTED)
        canvas.drawString(16 * mm, 9 * mm, f"AssetAdvisor · {rec['name']} · {first_day} to {end}")
        canvas.drawRightString(A4[0] - 16 * mm, 9 * mm, f"Page {d.page}")
        canvas.restoreState()

    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    return buf.getvalue()


def _prefix(owner: str, pid: str) -> str:
    from services.sanitize import sanitize_filename

    if not re.fullmatch(r"p[0-9a-f]{11}", pid):
        raise ValueError("bad portfolio id")
    return f"{sanitize_filename(owner)}/{pid}/"


def list_stored(owner: str, pid: str) -> list[dict]:
    pre = _prefix(owner, pid)
    return [{"month": k[len(pre):-4], "size": size} for k, size in reversed(store.list_blobs("statements", pre))
            if k.endswith(".pdf")]


def read_stored(owner: str, pid: str, month: str) -> bytes | None:
    if not re.fullmatch(r"\d{4}-\d{2}", month):
        return None
    return store.get_blob("statements", f"{_prefix(owner, pid)}{month}.pdf")


async def generate_monthly(today: date | None = None) -> None:
    """After a month ends, store last month's statement for every portfolio with activity (idempotent)."""
    from services.auth import load_users
    from services.notifications import add_notification

    today = today or datetime.now(timezone.utc).date()
    first_this = today.replace(day=1)
    last_month_end = first_this - timedelta(days=1)
    month = f"{last_month_end:%Y-%m}"
    first_day = last_month_end.replace(day=1)
    names = {u["username"]: " ".join(filter(None, [u.get("first_name"), u.get("last_name")])) for u in load_users()}
    for owner in user_data.users_with(portfolios.NAMESPACE):
        made = []
        for rec in portfolios.list_own(owner):
            key = f"{_prefix(owner, rec['id'])}{month}.pdf"
            if store.get_blob("statements", key) is not None:
                continue
            if not any(date.fromisoformat(t["date"][:10]) <= last_month_end for t in get_trades(owner, [rec["id"]])) and \
                    not any(date.fromisoformat(e["date"]) <= last_month_end for e in cash_ledger.get_entries(owner, [rec["id"]])):
                continue
            try:
                pdf = await build_pdf(owner, rec["id"], first_day, last_month_end, names.get(owner) or owner)
            except Exception as exc:  # noqa: BLE001
                print(f"[statements] {owner}/{rec['id']} {month}: {exc}")
                continue
            store.put_blob("statements", key, pdf, "application/pdf")
            made.append(rec["name"])
        if made:
            add_notification(owner, f"{calendar.month_name[last_month_end.month]} statements are ready",
                             f"Statements for {', '.join(made[:5])}{' and more' if len(made) > 5 else ''} are on the Performance page.",
                             category="portfolio")
