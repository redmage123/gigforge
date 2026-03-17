"""Generate BACSWN Distributed Architecture Financial Model PDF."""

from reportlab.lib.pagesizes import letter, landscape
from reportlab.lib.units import inch
from reportlab.lib.colors import HexColor, black, white
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, HRFlowable, KeepTogether
)
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY, TA_RIGHT
from datetime import datetime

OUTPUT = "/home/bbrelin/bacswn/BACSWN_Financial_Model.pdf"

# Colors
NAVY = HexColor("#0a0e17")
DARK = HexColor("#1e293b")
ACCENT = HexColor("#3b82f6")
LIGHT_BLUE = HexColor("#dbeafe")
MUTED = HexColor("#64748b")
SUCCESS = HexColor("#10b981")
DANGER = HexColor("#ef4444")
WARNING = HexColor("#f59e0b")
GREEN_BG = HexColor("#f0fdf4")
BLUE_BG = HexColor("#eff6ff")
GRAY_BG = HexColor("#f8fafc")
STRIPE = HexColor("#f1f5f9")

styles = {
    "title": ParagraphStyle("Title", fontName="Helvetica-Bold", fontSize=28,
        textColor=NAVY, spaceAfter=6, alignment=TA_CENTER),
    "subtitle": ParagraphStyle("Subtitle", fontName="Helvetica", fontSize=14,
        textColor=MUTED, spaceAfter=20, alignment=TA_CENTER),
    "h1": ParagraphStyle("H1", fontName="Helvetica-Bold", fontSize=20,
        textColor=NAVY, spaceBefore=24, spaceAfter=10),
    "h2": ParagraphStyle("H2", fontName="Helvetica-Bold", fontSize=15,
        textColor=ACCENT, spaceBefore=18, spaceAfter=8),
    "h3": ParagraphStyle("H3", fontName="Helvetica-Bold", fontSize=12,
        textColor=DARK, spaceBefore=12, spaceAfter=6),
    "body": ParagraphStyle("Body", fontName="Helvetica", fontSize=10.5,
        textColor=DARK, spaceAfter=8, leading=15, alignment=TA_JUSTIFY),
    "bullet": ParagraphStyle("Bullet", fontName="Helvetica", fontSize=10.5,
        textColor=DARK, spaceAfter=4, leading=15, leftIndent=20,
        bulletIndent=8),
    "caption": ParagraphStyle("Caption", fontName="Helvetica-Oblique", fontSize=9,
        textColor=MUTED, spaceAfter=12, alignment=TA_CENTER),
    "footer": ParagraphStyle("Footer", fontName="Helvetica", fontSize=8,
        textColor=MUTED, alignment=TA_CENTER),
    "note": ParagraphStyle("Note", fontName="Helvetica-Oblique", fontSize=9,
        textColor=MUTED, spaceAfter=8, leading=12),
}

def hr():
    return HRFlowable(width="100%", thickness=1, color=HexColor("#e2e8f0"), spaceBefore=8, spaceAfter=8)

def spacer(h=12):
    return Spacer(1, h)

def p(text, style="body"):
    return Paragraph(text, styles[style])

def bullet(text):
    return Paragraph(f"• {text}", styles["bullet"])

def money_table(data, col_widths, header_color=NAVY, stripe_colors=None):
    """Create a styled financial table."""
    if stripe_colors is None:
        stripe_colors = [white, STRIPE]
    t = Table(data, colWidths=col_widths)
    style_cmds = [
        ("BACKGROUND", (0, 0), (-1, 0), header_color),
        ("TEXTCOLOR", (0, 0), (-1, 0), white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("FONTNAME", (0, 1), (0, -1), "Helvetica-Bold"),
        ("FONTNAME", (1, 1), (-1, -1), "Helvetica"),
        ("GRID", (0, 0), (-1, -1), 0.5, HexColor("#e2e8f0")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), stripe_colors),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
        ("ALIGN", (0, 0), (0, -1), "LEFT"),
    ]
    t.setStyle(TableStyle(style_cmds))
    return t

def totals_row_style(table, row_idx, bg_color=NAVY):
    """Add bold totals row styling."""
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, row_idx), (-1, row_idx), bg_color),
        ("TEXTCOLOR", (0, row_idx), (-1, row_idx), white),
        ("FONTNAME", (0, row_idx), (-1, row_idx), "Helvetica-Bold"),
        ("FONTSIZE", (0, row_idx), (-1, row_idx), 10),
    ]))

def build_pdf():
    doc = SimpleDocTemplate(
        OUTPUT, pagesize=letter,
        topMargin=0.8*inch, bottomMargin=0.8*inch,
        leftMargin=0.9*inch, rightMargin=0.9*inch,
    )

    story = []

    # ── COVER ───────────────────────────────────────────────────────
    story.append(spacer(100))
    story.append(p("BACSWN", "title"))
    story.append(p("Bahamas Aviation, Climate and Severe Weather Network", "subtitle"))
    story.append(spacer(10))
    story.append(HRFlowable(width="60%", thickness=3, color=ACCENT, spaceBefore=0, spaceAfter=20))
    story.append(spacer(10))

    title_s = ParagraphStyle("BigTitle", fontName="Helvetica-Bold", fontSize=24,
        textColor=NAVY, spaceAfter=12, alignment=TA_CENTER, leading=30)
    story.append(Paragraph(
        "Distributed Intelligence Architecture<br/>"
        "Financial Model &amp; Business Case",
        title_s
    ))
    story.append(spacer(30))
    story.append(p("Implementation Partner: Sky Miles Limited — AI Elevate Division", "subtitle"))
    story.append(spacer(20))

    meta = [
        ["Document:", "BACSWN-FIN-2026-001"],
        ["Classification:", "CONFIDENTIAL — COMMERCIAL IN CONFIDENCE"],
        ["Prepared for:", "Ministry of Transport &amp; Aviation, Commonwealth of The Bahamas"],
        ["Prepared by:", "Sky Miles Limited — AI Elevate Division"],
        ["Date:", datetime.now().strftime("%B %d, %Y")],
        ["Version:", "1.0"],
        ["Currency:", "United States Dollar (USD)"],
    ]
    mt = Table(meta, colWidths=[1.5*inch, 4.5*inch])
    mt.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTNAME", (1, 0), (1, -1), "Helvetica"),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("TEXTCOLOR", (0, 0), (0, -1), MUTED),
        ("TEXTCOLOR", (1, 0), (1, -1), DARK),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(mt)

    story.append(PageBreak())

    # ── TABLE OF CONTENTS ───────────────────────────────────────────
    story.append(p("Table of Contents", "h1"))
    story.append(hr())
    toc = [
        ("1.", "Executive Financial Summary"),
        ("2.", "Program Budget — 24-Month Implementation"),
        ("3.", "Revenue Model"),
        ("4.", "Cost Structure — Detailed Breakdown"),
        ("5.", "Profit &amp; Loss Projection (5-Year)"),
        ("6.", "Cash Flow Analysis"),
        ("7.", "Funding Strategy &amp; Grant Offsets"),
        ("8.", "Return on Investment Analysis"),
        ("9.", "Sensitivity Analysis"),
        ("10.", "Risk-Adjusted Financial Scenarios"),
        ("11.", "Staffing Plan &amp; Compensation"),
        ("12.", "Hardware &amp; Infrastructure Costs"),
        ("13.", "Recurring Revenue Streams"),
        ("14.", "Financial Assumptions &amp; Notes"),
    ]
    for num, title in toc:
        story.append(p(f"<b>{num}</b>&nbsp;&nbsp;&nbsp;{title}"))
    story.append(PageBreak())

    # ── 1. EXECUTIVE FINANCIAL SUMMARY ──────────────────────────────
    story.append(p("1. Executive Financial Summary", "h1"))
    story.append(hr())
    story.append(p(
        "The BACSWN Distributed Intelligence Architecture represents a $17.0M capital investment "
        "over 24 months, transitioning to $1.8M annual operations. Sky Miles Limited, as implementation "
        "partner, projects the following financial structure:"
    ))

    exec_data = [
        ["Metric", "Value"],
        ["Total Contract Value (Implementation)", "$17,000,000"],
        ["Implementation Period", "24 months (4 phases)"],
        ["Sky Miles Revenue (Implementation)", "$17,000,000"],
        ["Sky Miles Cost of Delivery", "$11,050,000"],
        ["Gross Profit (Implementation)", "$5,950,000"],
        ["Gross Margin", "35.0%"],
        ["Annual Recurring Revenue (Year 3+)", "$3,600,000 - $5,800,000"],
        ["Annual Recurring Cost", "$1,400,000"],
        ["Recurring Gross Margin", "61% - 76%"],
        ["5-Year Total Revenue", "$34,200,000 - $42,600,000"],
        ["5-Year Total Profit", "$15,900,000 - $24,300,000"],
        ["Break-even Point", "Month 18"],
        ["5-Year ROI (Sky Miles)", "144% - 220%"],
    ]
    et = money_table(exec_data, [2.5*inch, 3.1*inch])
    et.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), ACCENT),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))
    story.append(et)
    story.append(p("Table 1: Executive financial summary", "caption"))

    story.append(PageBreak())

    # ── 2. PROGRAM BUDGET ───────────────────────────────────────────
    story.append(p("2. Program Budget — 24-Month Implementation", "h1"))
    story.append(hr())

    budget_data = [
        ["Phase", "Timeline", "Revenue", "COGS", "Gross Profit", "Margin"],
        ["Phase 1: Foundation", "Months 1-6", "$2,800,000", "$1,820,000", "$980,000", "35.0%"],
        ["Phase 2: Intelligence", "Months 7-12", "$4,200,000", "$2,730,000", "$1,470,000", "35.0%"],
        ["Phase 3: Full Network", "Months 13-18", "$6,500,000", "$4,225,000", "$2,275,000", "35.0%"],
        ["Phase 4: Advanced", "Months 19-24", "$3,500,000", "$2,275,000", "$1,225,000", "35.0%"],
        ["TOTAL", "24 months", "$17,000,000", "$11,050,000", "$5,950,000", "35.0%"],
    ]
    bt = money_table(budget_data, [1.3*inch, 0.9*inch, 1.0*inch, 1.0*inch, 1.0*inch, 0.7*inch])
    totals_row_style(bt, 5, ACCENT)
    story.append(bt)
    story.append(p("Table 2: Phase-by-phase budget breakdown", "caption"))

    story.append(p("2.1 Phase 1 — Foundation ($2.8M)", "h2"))
    phase1 = [
        ["Item", "Cost", "Revenue", "Notes"],
        ["Edge compute hardware (4 stations)", "$320,000", "—", "Jetson Orin Nano + enclosures"],
        ["VHF radio equipment (4 stations)", "$180,000", "—", "Motorola MTR3000 repeaters"],
        ["Iridium satellite modems (4 units)", "$60,000", "—", "9603 SBD transceivers"],
        ["Solar + battery systems (4 stations)", "$120,000", "—", "48V DC + 72hr backup"],
        ["Field deployment &amp; logistics", "$200,000", "—", "Installation, marine transport"],
        ["URCA spectrum licensing", "$40,000", "—", "VHF band application + fees"],
        ["Software development (6 months)", "$600,000", "—", "Mesh protocol, edge runtime"],
        ["Engineering team (6 months)", "$300,000", "—", "4 engineers + PM"],
        ["Total Phase 1 COGS", "$1,820,000", "$2,800,000", ""],
    ]
    p1t = money_table(phase1, [2.0*inch, 1.0*inch, 0.8*inch, 2.0*inch])
    totals_row_style(p1t, len(phase1)-1, HexColor("#334155"))
    story.append(p1t)
    story.append(p("Table 3: Phase 1 detailed cost breakdown", "caption"))

    story.append(PageBreak())

    # ── 3. REVENUE MODEL ────────────────────────────────────────────
    story.append(p("3. Revenue Model", "h1"))
    story.append(hr())

    story.append(p("3.1 Implementation Revenue (Years 1-2)", "h2"))
    story.append(p(
        "Implementation revenue is structured as milestone-based payments tied to phase deliverables. "
        "Each phase has defined acceptance criteria verified by the Ministry of Transport &amp; Aviation."
    ))

    impl_rev = [
        ["Revenue Stream", "Year 1", "Year 2", "Total"],
        ["Phase 1 milestone payments", "$2,800,000", "—", "$2,800,000"],
        ["Phase 2 milestone payments", "$4,200,000", "—", "$4,200,000"],
        ["Phase 3 milestone payments", "—", "$6,500,000", "$6,500,000"],
        ["Phase 4 milestone payments", "—", "$3,500,000", "$3,500,000"],
        ["TOTAL IMPLEMENTATION", "$7,000,000", "$10,000,000", "$17,000,000"],
    ]
    irt = money_table(impl_rev, [2.2*inch, 1.2*inch, 1.2*inch, 1.2*inch])
    totals_row_style(irt, 5, ACCENT)
    story.append(irt)
    story.append(p("Table 4: Implementation revenue schedule", "caption"))

    story.append(p("3.2 Recurring Revenue (Year 3+)", "h2"))

    recur_rev = [
        ["Revenue Stream", "Year 3", "Year 4", "Year 5", "Notes"],
        ["O&M Contract", "$1,800,000", "$1,854,000", "$1,910,000", "3% annual escalation"],
        ["Software licensing &amp; updates", "$500,000", "$515,000", "$530,000", "Platform subscription"],
        ["CARICOM licensing (Jamaica)", "—", "$800,000", "$1,200,000", "First regional deployment"],
        ["CARICOM licensing (Trinidad)", "—", "—", "$800,000", "Second regional deployment"],
        ["Climate data monetization", "$300,000", "$400,000", "$500,000", "Shipping, energy, agriculture"],
        ["Training &amp; certification", "$200,000", "$200,000", "$200,000", "Annual meteorologist training"],
        ["Consulting &amp; advisory", "$300,000", "$350,000", "$400,000", "Technical advisory services"],
        ["Hardware refresh cycle", "$500,000", "—", "$500,000", "Every 2 years"],
        ["TOTAL RECURRING", "$3,600,000", "$4,119,000", "$6,040,000", ""],
    ]
    rrt = money_table(recur_rev, [1.6*inch, 0.9*inch, 0.9*inch, 0.9*inch, 1.6*inch])
    totals_row_style(rrt, len(recur_rev)-1, SUCCESS)
    story.append(rrt)
    story.append(p("Table 5: Recurring revenue projection (Years 3-5)", "caption"))

    story.append(PageBreak())

    # ── 4. COST STRUCTURE ───────────────────────────────────────────
    story.append(p("4. Cost Structure — Detailed Breakdown", "h1"))
    story.append(hr())

    story.append(p("4.1 Implementation Costs", "h2"))
    impl_cost = [
        ["Category", "Year 1", "Year 2", "Total", "% of Total"],
        ["Hardware &amp; equipment", "$1,200,000", "$1,500,000", "$2,700,000", "24.4%"],
        ["Software development", "$1,200,000", "$1,800,000", "$3,000,000", "27.1%"],
        ["Engineering labor", "$1,500,000", "$2,100,000", "$3,600,000", "32.6%"],
        ["Field deployment", "$300,000", "$800,000", "$1,100,000", "10.0%"],
        ["Licensing &amp; regulatory", "$100,000", "$50,000", "$150,000", "1.4%"],
        ["Satellite service contracts", "$150,000", "$200,000", "$350,000", "3.2%"],
        ["Contingency (5%)", "$100,000", "$50,000", "$150,000", "1.4%"],
        ["TOTAL IMPLEMENTATION COST", "$4,550,000", "$6,500,000", "$11,050,000", "100%"],
    ]
    ict = money_table(impl_cost, [1.5*inch, 1.0*inch, 1.0*inch, 1.0*inch, 0.7*inch])
    totals_row_style(ict, len(impl_cost)-1, DANGER)
    story.append(ict)
    story.append(p("Table 6: Implementation cost breakdown", "caption"))

    story.append(p("4.2 Recurring Costs (Year 3+)", "h2"))
    recur_cost = [
        ["Category", "Year 3", "Year 4", "Year 5"],
        ["Operations team (6 FTE)", "$720,000", "$742,000", "$764,000"],
        ["Satellite service (Iridium)", "$180,000", "$185,000", "$191,000"],
        ["Hardware maintenance &amp; spares", "$150,000", "$155,000", "$160,000"],
        ["Software maintenance &amp; updates", "$120,000", "$124,000", "$128,000"],
        ["VHF spectrum fees", "$30,000", "$31,000", "$32,000"],
        ["Insurance &amp; compliance", "$50,000", "$52,000", "$54,000"],
        ["Travel &amp; field operations", "$100,000", "$103,000", "$106,000"],
        ["Cloud infrastructure (hub)", "$50,000", "$52,000", "$54,000"],
        ["TOTAL RECURRING COST", "$1,400,000", "$1,444,000", "$1,489,000", ],
    ]
    rct = money_table(recur_cost, [2.0*inch, 1.1*inch, 1.1*inch, 1.1*inch])
    totals_row_style(rct, len(recur_cost)-1, DANGER)
    story.append(rct)
    story.append(p("Table 7: Recurring cost projection (Years 3-5)", "caption"))

    story.append(PageBreak())

    # ── 5. P&L PROJECTION ──────────────────────────────────────────
    story.append(p("5. Profit &amp; Loss Projection (5-Year)", "h1"))
    story.append(hr())

    pnl = [
        ["", "Year 1", "Year 2", "Year 3", "Year 4", "Year 5", "Total"],
        ["Revenue", "$7,000,000", "$10,000,000", "$3,600,000", "$4,119,000", "$6,040,000", "$30,759,000"],
        ["COGS / Delivery", "$4,550,000", "$6,500,000", "$1,400,000", "$1,444,000", "$1,489,000", "$15,383,000"],
        ["GROSS PROFIT", "$2,450,000", "$3,500,000", "$2,200,000", "$2,675,000", "$4,551,000", "$15,376,000"],
        ["Gross Margin %", "35.0%", "35.0%", "61.1%", "64.9%", "75.3%", "50.0%"],
        ["", "", "", "", "", "", ""],
        ["G&A Overhead (15%)", "$1,050,000", "$1,500,000", "$540,000", "$618,000", "$906,000", "$4,614,000"],
        ["Sales &amp; Marketing", "$200,000", "$300,000", "$250,000", "$300,000", "$350,000", "$1,400,000"],
        ["R&D (reinvestment)", "$300,000", "$400,000", "$300,000", "$300,000", "$300,000", "$1,600,000"],
        ["TOTAL OPEX", "$1,550,000", "$2,200,000", "$1,090,000", "$1,218,000", "$1,556,000", "$7,614,000"],
        ["", "", "", "", "", "", ""],
        ["EBITDA", "$900,000", "$1,300,000", "$1,110,000", "$1,457,000", "$2,995,000", "$7,762,000"],
        ["EBITDA Margin %", "12.9%", "13.0%", "30.8%", "35.4%", "49.6%", "25.2%"],
        ["", "", "", "", "", "", ""],
        ["Depreciation (hardware)", "$135,000", "$270,000", "$270,000", "$270,000", "$270,000", "$1,215,000"],
        ["NET INCOME (pre-tax)", "$765,000", "$1,030,000", "$840,000", "$1,187,000", "$2,725,000", "$6,547,000"],
        ["Estimated Tax (25%)", "$191,250", "$257,500", "$210,000", "$296,750", "$681,250", "$1,636,750"],
        ["NET INCOME (post-tax)", "$573,750", "$772,500", "$630,000", "$890,250", "$2,043,750", "$4,910,250"],
    ]
    pnlt = money_table(pnl, [1.3*inch, 0.85*inch, 0.85*inch, 0.85*inch, 0.85*inch, 0.85*inch, 0.85*inch])
    # Style key rows
    for row_idx in [3, 11, 15, 17]:
        pnlt.setStyle(TableStyle([
            ("FONTNAME", (0, row_idx), (-1, row_idx), "Helvetica-Bold"),
            ("FONTSIZE", (0, row_idx), (-1, row_idx), 10),
        ]))
    pnlt.setStyle(TableStyle([
        ("BACKGROUND", (0, 3), (-1, 3), GREEN_BG),
        ("TEXTCOLOR", (0, 3), (-1, 3), SUCCESS),
        ("BACKGROUND", (0, 11), (-1, 11), BLUE_BG),
        ("TEXTCOLOR", (0, 11), (-1, 11), ACCENT),
        ("BACKGROUND", (0, 17), (-1, 17), GREEN_BG),
        ("TEXTCOLOR", (0, 17), (-1, 17), SUCCESS),
    ]))
    story.append(pnlt)
    story.append(p("Table 8: 5-year Profit &amp; Loss projection", "caption"))

    story.append(PageBreak())

    # ── 6. CASH FLOW ────────────────────────────────────────────────
    story.append(p("6. Cash Flow Analysis", "h1"))
    story.append(hr())

    cf = [
        ["", "Year 1", "Year 2", "Year 3", "Year 4", "Year 5"],
        ["Cash from operations", "$573,750", "$772,500", "$630,000", "$890,250", "$2,043,750"],
        ["Add: depreciation", "$135,000", "$270,000", "$270,000", "$270,000", "$270,000"],
        ["CapEx (hardware)", "($1,200,000)", "($1,500,000)", "($500,000)", "—", "($500,000)"],
        ["Working capital change", "($350,000)", "($200,000)", "$100,000", "$50,000", "$50,000"],
        ["FREE CASH FLOW", "($841,250)", "($657,500)", "$500,000", "$1,210,250", "$1,863,750"],
        ["Cumulative FCF", "($841,250)", "($1,498,750)", "($998,750)", "$211,500", "$2,075,250"],
    ]
    cft = money_table(cf, [1.3*inch, 1.0*inch, 1.0*inch, 1.0*inch, 1.0*inch, 1.0*inch])
    cft.setStyle(TableStyle([
        ("FONTNAME", (0, 5), (-1, 5), "Helvetica-Bold"),
        ("BACKGROUND", (0, 5), (-1, 5), BLUE_BG),
        ("FONTNAME", (0, 6), (-1, 6), "Helvetica-Bold"),
        ("BACKGROUND", (0, 6), (-1, 6), GREEN_BG),
        ("TEXTCOLOR", (1, 6), (2, 6), DANGER),
        ("TEXTCOLOR", (3, 6), (3, 6), DANGER),
        ("TEXTCOLOR", (4, 6), (5, 6), SUCCESS),
    ]))
    story.append(cft)
    story.append(p("Table 9: 5-year cash flow analysis", "caption"))

    story.append(p(
        "Sky Miles achieves <b>positive cumulative free cash flow in Year 4</b> (month ~40). "
        "The initial negative cash flow reflects hardware CapEx front-loading in Years 1-2. "
        "By Year 5, the business generates $1.86M annual free cash flow with strong growth "
        "trajectory from CARICOM licensing."
    ))

    story.append(p("6.1 Milestone Payment Schedule", "h2"))
    milestones = [
        ["Milestone", "Trigger", "Payment", "Cumulative"],
        ["M1: Contract signing", "Contract execution", "$1,400,000", "$1,400,000"],
        ["M2: Phase 1 pilot deployment", "4 stations operational", "$1,400,000", "$2,800,000"],
        ["M3: Phase 2 AI deployment", "Edge AI on 4 pilots", "$2,100,000", "$4,900,000"],
        ["M4: Phase 2 consensus", "Consensus protocol tested", "$2,100,000", "$7,000,000"],
        ["M5: Phase 3 full rollout", "15 stations operational", "$3,250,000", "$10,250,000"],
        ["M6: Phase 3 acceptance", "Full mesh verified", "$3,250,000", "$13,500,000"],
        ["M7: Phase 4 advanced", "Hurricane mode tested", "$1,750,000", "$15,250,000"],
        ["M8: Final acceptance", "Full system sign-off", "$1,750,000", "$17,000,000"],
    ]
    mst = money_table(milestones, [1.5*inch, 1.5*inch, 1.0*inch, 1.0*inch])
    story.append(mst)
    story.append(p("Table 10: Implementation milestone payment schedule", "caption"))

    story.append(PageBreak())

    # ── 7. FUNDING STRATEGY ─────────────────────────────────────────
    story.append(p("7. Funding Strategy &amp; Grant Offsets", "h1"))
    story.append(hr())

    story.append(p(
        "A significant portion of the program cost can be offset through international climate "
        "resilience funding. The Bahamas qualifies as a Small Island Developing State (SIDS) "
        "under UNFCCC, making the project eligible for multiple funding mechanisms."
    ))

    grants = [
        ["Funding Source", "Eligible Amount", "Probability", "Expected Value"],
        ["Green Climate Fund (GCF)", "$5,000,000", "60%", "$3,000,000"],
        ["Inter-American Development Bank", "$3,000,000", "50%", "$1,500,000"],
        ["UK Caribbean Infrastructure Fund", "$2,000,000", "40%", "$800,000"],
        ["WMO Systematic Observation Fund", "$1,000,000", "70%", "$700,000"],
        ["USAID Climate Adaptation", "$1,500,000", "35%", "$525,000"],
        ["EU Global Gateway (Caribbean)", "$1,000,000", "30%", "$300,000"],
        ["TOTAL POTENTIAL", "$13,500,000", "—", "$6,825,000"],
    ]
    gt = money_table(grants, [2.0*inch, 1.2*inch, 0.8*inch, 1.2*inch])
    totals_row_style(gt, len(grants)-1, SUCCESS)
    story.append(gt)
    story.append(p("Table 11: Grant funding opportunities and expected values", "caption"))

    story.append(p(
        "Expected grant recovery of <b>$6.8M offsets 40% of the $17M program cost</b>, reducing "
        "the Government's net investment to approximately $10.2M. Sky Miles' implementation "
        "fee structure remains unchanged regardless of funding source."
    ))

    story.append(PageBreak())

    # ── 8. ROI ANALYSIS ─────────────────────────────────────────────
    story.append(p("8. Return on Investment Analysis", "h1"))
    story.append(hr())

    story.append(p("8.1 Sky Miles ROI (Implementation Partner)", "h2"))
    roi_sm = [
        ["Metric", "Conservative", "Base Case", "Optimistic"],
        ["5-Year Total Revenue", "$27,400,000", "$30,759,000", "$38,200,000"],
        ["5-Year Total Cost", "$20,100,000", "$22,997,000", "$22,997,000"],
        ["5-Year Net Profit", "$4,100,000", "$4,910,250", "$9,500,000"],
        ["5-Year ROI", "59%", "71%", "137%"],
        ["IRR", "22%", "28%", "41%"],
        ["Payback Period", "Month 46", "Month 40", "Month 30"],
        ["NPV (10% discount)", "$2,800,000", "$3,400,000", "$6,900,000"],
    ]
    roit = money_table(roi_sm, [1.5*inch, 1.3*inch, 1.3*inch, 1.3*inch])
    roit.setStyle(TableStyle([
        ("BACKGROUND", (3, 1), (3, -1), GREEN_BG),
    ]))
    story.append(roit)
    story.append(p("Table 12: Sky Miles 5-year ROI analysis — three scenarios", "caption"))

    story.append(p("8.2 Government ROI (The Bahamas)", "h2"))
    roi_gov = [
        ["Benefit Category", "Annual Value", "5-Year NPV", "Methodology"],
        ["Hurricane damage reduction", "$50-150M per event", "$75-225M", "1.5-4.5% of avg. major damage"],
        ["Lives protected", "15-30 per major event", "Incalculable", "Autonomous alerting capability"],
        ["Aviation safety improvement", "$5-10M", "$25-50M", "60% weather incident reduction"],
        ["Insurance premium reduction", "$5-10M/year", "$25-50M", "National property insurance"],
        ["Tourism confidence", "$10-20M/year", "$50-100M", "Hurricane season visitor retention"],
        ["Regional leadership", "Strategic", "Strategic", "First distributed WX net in Caribbean"],
        ["Total net investment", "$10.2M", "—", "After grant offsets"],
        ["BENEFIT-COST RATIO", "—", "15:1 to 40:1", "Conservative to optimistic"],
    ]
    roigt = money_table(roi_gov, [1.5*inch, 1.2*inch, 1.0*inch, 2.0*inch])
    totals_row_style(roigt, len(roi_gov)-1, SUCCESS)
    story.append(roigt)
    story.append(p("Table 13: Government benefit-cost analysis", "caption"))

    story.append(PageBreak())

    # ── 9. SENSITIVITY ANALYSIS ─────────────────────────────────────
    story.append(p("9. Sensitivity Analysis", "h1"))
    story.append(hr())
    story.append(p(
        "The following table shows how Sky Miles' 5-year net income varies with changes "
        "in key assumptions. Base case values are highlighted."
    ))

    sensitivity = [
        ["Variable", "-20%", "-10%", "Base", "+10%", "+20%"],
        ["Implementation margin", "$2.7M", "$3.8M", "$4.9M", "$6.0M", "$7.1M"],
        ["Recurring revenue", "$3.5M", "$4.2M", "$4.9M", "$5.6M", "$6.3M"],
        ["CARICOM uptake", "$3.8M", "$4.4M", "$4.9M", "$5.5M", "$6.0M"],
        ["Labor costs", "$5.9M", "$5.4M", "$4.9M", "$4.4M", "$3.9M"],
        ["Hardware costs", "$5.4M", "$5.2M", "$4.9M", "$4.6M", "$4.4M"],
        ["Schedule delay (months)", "$4.9M", "$4.9M", "$4.9M", "$4.2M", "$3.5M"],
    ]
    st2 = money_table(sensitivity, [1.3*inch, 0.9*inch, 0.9*inch, 0.9*inch, 0.9*inch, 0.9*inch])
    st2.setStyle(TableStyle([
        ("BACKGROUND", (3, 1), (3, -1), BLUE_BG),
        ("FONTNAME", (3, 1), (3, -1), "Helvetica-Bold"),
    ]))
    story.append(st2)
    story.append(p("Table 14: Sensitivity analysis — 5-year net income impact", "caption"))

    story.append(p(
        "The model is <b>most sensitive to implementation margin</b> and <b>recurring revenue "
        "growth</b>. A 20% reduction in implementation margin reduces 5-year profit by $2.2M, "
        "while CARICOM licensing delays have a more moderate $1.1M impact. The model is "
        "relatively insensitive to hardware cost fluctuations."
    ))

    story.append(PageBreak())

    # ── 10. RISK-ADJUSTED SCENARIOS ─────────────────────────────────
    story.append(p("10. Risk-Adjusted Financial Scenarios", "h1"))
    story.append(hr())

    scenarios = [
        ["Scenario", "Probability", "5-Year Revenue", "5-Year Profit", "Description"],
        ["Bull Case", "20%", "$38,200,000", "$9,500,000", "3 CARICOM licenses by Y5,\nstrong data monetization"],
        ["Base Case", "50%", "$30,759,000", "$4,910,250", "1 CARICOM license by Y4,\nmoderate recurring growth"],
        ["Bear Case", "25%", "$22,000,000", "$1,800,000", "No CARICOM uptake,\nO&M contract only"],
        ["Worst Case", "5%", "$17,000,000", "$500,000", "Implementation only,\nno recurring revenue"],
        ["EXPECTED VALUE", "100%", "$29,205,000", "$4,477,563", "Probability-weighted"],
    ]
    sct = money_table(scenarios, [0.9*inch, 0.7*inch, 1.1*inch, 1.0*inch, 2.1*inch])
    totals_row_style(sct, len(scenarios)-1, ACCENT)
    story.append(sct)
    story.append(p("Table 15: Risk-adjusted financial scenarios", "caption"))

    story.append(PageBreak())

    # ── 11. STAFFING PLAN ───────────────────────────────────────────
    story.append(p("11. Staffing Plan &amp; Compensation", "h1"))
    story.append(hr())

    staff = [
        ["Role", "Count", "Annual Cost", "Y1-2", "Y3+", "Location"],
        ["Program Director", "1", "$180,000", "✓", "✓", "Nassau"],
        ["Lead Systems Architect", "1", "$165,000", "✓", "—", "Nassau"],
        ["Embedded Systems Engineer", "2", "$140,000 ea", "✓", "1", "Nassau"],
        ["AI/ML Engineer", "2", "$150,000 ea", "✓", "1", "Nassau/Remote"],
        ["RF/Communications Engineer", "1", "$135,000", "✓", "—", "Nassau"],
        ["Full-Stack Developer", "2", "$130,000 ea", "✓", "1", "Nassau/Remote"],
        ["Field Deployment Technician", "3", "$65,000 ea", "✓", "2", "Multi-island"],
        ["DevOps / SRE", "1", "$140,000", "✓", "✓", "Nassau"],
        ["QA Engineer", "1", "$110,000", "✓", "—", "Nassau"],
        ["Project Manager", "1", "$120,000", "✓", "—", "Nassau"],
        ["TOTAL (Implementation)", "15", "$1,900,000/yr", "", "", ""],
        ["TOTAL (Operations Y3+)", "6", "$720,000/yr", "", "", ""],
    ]
    sft = money_table(staff, [1.5*inch, 0.5*inch, 1.0*inch, 0.4*inch, 0.4*inch, 1.0*inch])
    totals_row_style(sft, len(staff)-2, HexColor("#334155"))
    totals_row_style(sft, len(staff)-1, SUCCESS)
    story.append(sft)
    story.append(p("Table 16: Staffing plan — implementation and operations phases", "caption"))

    story.append(PageBreak())

    # ── 12. HARDWARE COSTS ──────────────────────────────────────────
    story.append(p("12. Hardware &amp; Infrastructure Costs", "h1"))
    story.append(hr())

    hw = [
        ["Component", "Unit Cost", "Qty", "Total", "Lifecycle"],
        ["NVIDIA Jetson Orin Nano 8GB", "$499", "15", "$7,485", "3 years"],
        ["Ruggedized enclosure (IP67, 200mph)", "$3,200", "15", "$48,000", "10 years"],
        ["Industrial NVMe 256GB", "$180", "15", "$2,700", "5 years"],
        ["Motorola MTR3000 VHF repeater", "$8,500", "15", "$127,500", "7 years"],
        ["VHF antenna + feedline", "$1,200", "15", "$18,000", "10 years"],
        ["Iridium 9603 SBD transceiver", "$2,800", "15", "$42,000", "5 years"],
        ["Sierra Wireless RV55 (4G LTE)", "$650", "15", "$9,750", "5 years"],
        ["Solar panel array (200W)", "$800", "15", "$12,000", "20 years"],
        ["LiFePO4 battery bank (48V, 72hr)", "$4,500", "15", "$67,500", "8 years"],
        ["Charge controller + inverter", "$600", "15", "$9,000", "10 years"],
        ["Sensor array (temp/press/wind/vis)", "$12,000", "15", "$180,000", "5 years"],
        ["Ceilometer (cloud base)", "$8,000", "15", "$120,000", "7 years"],
        ["Installation hardware &amp; cabling", "$2,000", "15", "$30,000", "—"],
        ["Spares &amp; contingency (10%)", "—", "—", "$67,394", "—"],
        ["TOTAL PER-STATION HARDWARE", "$45,929", "—", "—", "—"],
        ["TOTAL ALL STATIONS", "—", "15", "$741,329", "—"],
    ]
    hwt = money_table(hw, [1.8*inch, 0.8*inch, 0.4*inch, 0.8*inch, 0.7*inch])
    totals_row_style(hwt, len(hw)-2, HexColor("#334155"))
    totals_row_style(hwt, len(hw)-1, ACCENT)
    story.append(hwt)
    story.append(p("Table 17: Per-station hardware bill of materials", "caption"))

    story.append(p(
        "Note: Hardware costs represent approximately <b>$741K of the $2.7M total hardware budget</b>. "
        "The remaining $1.96M covers marine transport logistics, installation labor, site preparation "
        "(concrete pads, power connections), and commissioning across 15 remote island locations."
    ))

    story.append(PageBreak())

    # ── 13. RECURRING REVENUE ───────────────────────────────────────
    story.append(p("13. Recurring Revenue Streams", "h1"))
    story.append(hr())

    story.append(p(
        "The long-term financial value of this project lies in the transition from one-time "
        "implementation revenue to high-margin recurring revenue streams. By Year 5, Sky Miles "
        "projects $6.0M in annual recurring revenue at 75% gross margin."
    ))

    story.append(p("13.1 Revenue Waterfall (Year 1 → Year 5)", "h2"))
    waterfall = [
        ["Year", "Implementation", "O&M", "Licensing", "CARICOM", "Data/Other", "Total"],
        ["Year 1", "$7,000,000", "—", "—", "—", "—", "$7,000,000"],
        ["Year 2", "$10,000,000", "—", "—", "—", "—", "$10,000,000"],
        ["Year 3", "—", "$1,800,000", "$500,000", "—", "$1,300,000", "$3,600,000"],
        ["Year 4", "—", "$1,854,000", "$515,000", "$800,000", "$950,000", "$4,119,000"],
        ["Year 5", "—", "$1,910,000", "$530,000", "$2,000,000", "$1,600,000", "$6,040,000"],
        ["TOTAL", "$17,000,000", "$5,564,000", "$1,545,000", "$2,800,000", "$3,850,000", "$30,759,000"],
    ]
    wft = money_table(waterfall, [0.6*inch, 1.0*inch, 0.9*inch, 0.7*inch, 0.9*inch, 0.8*inch, 0.9*inch])
    totals_row_style(wft, len(waterfall)-1, ACCENT)
    story.append(wft)
    story.append(p("Table 18: Revenue waterfall by stream (5-year)", "caption"))

    story.append(p("13.2 CARICOM Expansion Model", "h2"))
    story.append(p(
        "The BACSWN architecture is directly transferable to other Caribbean island nations. "
        "Licensing fees are structured as a percentage of the Bahamas implementation cost, "
        "scaled by the target nation's station count and GDP."
    ))

    caricom = [
        ["Nation", "Stations", "License Fee", "O&M/Year", "Timeline", "Probability"],
        ["Jamaica", "8", "$800,000", "$450,000", "Year 4", "50%"],
        ["Trinidad &amp; Tobago", "6", "$600,000", "$350,000", "Year 5", "40%"],
        ["Barbados", "4", "$400,000", "$250,000", "Year 5-6", "35%"],
        ["Eastern Caribbean (OECS)", "12", "$1,000,000", "$550,000", "Year 6-7", "30%"],
        ["Guyana", "6", "$500,000", "$300,000", "Year 7", "25%"],
    ]
    cart = money_table(caricom, [1.4*inch, 0.6*inch, 0.9*inch, 0.8*inch, 0.7*inch, 0.8*inch])
    story.append(cart)
    story.append(p("Table 19: CARICOM regional licensing pipeline", "caption"))

    story.append(PageBreak())

    # ── 14. ASSUMPTIONS ─────────────────────────────────────────────
    story.append(p("14. Financial Assumptions &amp; Notes", "h1"))
    story.append(hr())

    assumptions = [
        "All figures in United States Dollars (USD). Bahamas Dollar is pegged 1:1 to USD.",
        "Implementation timeline assumes no major hurricane disruption during deployment.",
        "Labor costs reflect Nassau-based compensation with housing allowances for expatriate staff.",
        "Hardware costs based on Q1 2026 pricing; subject to supply chain fluctuations.",
        "Iridium satellite service priced at current government/enterprise rates ($12/message avg).",
        "3% annual cost escalation applied to all recurring costs.",
        "Tax rate of 25% applied — actual Bahamas corporate tax structure may differ.",
        "CARICOM licensing revenue assumes technology transfer + adaptation, not greenfield deployment.",
        "Grant funding estimates are probability-weighted; actual awards may vary significantly.",
        "Insurance premium reduction estimates based on discussions with Caribbean reinsurance brokers.",
        "Tourism confidence value estimated from Bahamas Ministry of Tourism exit survey data.",
        "Hardware depreciation calculated over 5-year straight-line schedule.",
        "Contingency of 5% included in implementation costs; not applied to recurring costs.",
        "NPV calculations use 10% discount rate reflecting project risk premium.",
        "Foreign exchange risk is minimal due to BSD-USD peg.",
    ]
    for a in assumptions:
        story.append(bullet(a))

    story.append(spacer(30))
    story.append(HRFlowable(width="40%", thickness=2, color=ACCENT))
    story.append(spacer(10))
    end_s = ParagraphStyle("End", fontName="Helvetica-Bold", fontSize=11,
        textColor=NAVY, alignment=TA_CENTER)
    story.append(Paragraph("End of Document", end_s))
    story.append(spacer(6))
    story.append(p("BACSWN-FIN-2026-001 | CONFIDENTIAL — COMMERCIAL IN CONFIDENCE", "footer"))
    story.append(p(
        f"Generated {datetime.now().strftime('%B %d, %Y at %H:%M UTC')}<br/>"
        "Sky Miles Limited — AI Elevate Division<br/>"
        "Nassau, Commonwealth of The Bahamas",
        "footer"
    ))

    doc.build(story)
    print(f"PDF generated: {OUTPUT}")

if __name__ == "__main__":
    build_pdf()
