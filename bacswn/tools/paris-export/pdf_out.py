"""Render the handout and the speaker notes as PDF with ReportLab.

The handout draws each slide's final frame from the same elements the PowerPoint file
uses (vector shapes and text, icons as images), with a one-line takeaway underneath.
The speaker notes are an A4 document: the story, the run sheet, controls and the notes.
"""
import math
import re
import zipfile
from html import escape
from pathlib import Path
from xml.sax.saxutils import escape as xesc

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

import art
from scenes import DECK, El, H, W, col, slides

FONTS = Path("/usr/share/fonts/truetype/liberation")
pdfmetrics.registerFont(TTFont("Sans", str(FONTS / "LiberationSans-Regular.ttf")))
pdfmetrics.registerFont(TTFont("Sans-Bold", str(FONTS / "LiberationSans-Bold.ttf")))


def rgb(c):
    return colors.HexColor("#" + col(c))


class Stage:
    """Draws stage elements (1920x1080 px, y down) into a box on a ReportLab canvas."""

    def __init__(self, cv, page_h, ox, oy, scale):
        self.c, self.ph, self.ox, self.oy, self.s = cv, page_h, ox, oy, scale

    def X(self, x):
        return self.ox + x * self.s

    def Y(self, y):
        return self.ph - (self.oy + y * self.s)

    def draw(self, el, dx=0, dy=0):
        c, s = self.c, self.s
        c.saveState()
        k = el.kind
        if k == "group":
            for ch in el.children:
                self.draw(ch, dx, dy)
        elif k in ("rect", "ellipse"):
            x, y, w, h = self.X(el.x + dx), self.Y(el.y + dy + el.h), el.w * s, el.h * s
            if el.alpha < 1:
                c.setFillAlpha(el.alpha)
            if True:
                if el.fill:
                    c.setFillColor(rgb(el.fill))
                if el.stroke:
                    c.setStrokeColor(rgb(el.stroke))
                    c.setLineWidth(el.sw * s)
                f, st = (1 if el.fill else 0), (1 if el.stroke else 0)
                if k == "ellipse":
                    c.ellipse(x, y, x + w, y + h, stroke=st, fill=f)
                else:
                    c.roundRect(x, y, w, h, el.radius * s, stroke=st, fill=f)
        elif k in ("line", "poly"):
            c.setStrokeColor(rgb(el.stroke))
            c.setLineWidth(el.sw * s)
            c.setLineCap(1)
            c.setLineJoin(1)
            p = c.beginPath()
            pts = [(self.X(x + dx), self.Y(y + dy)) for x, y in el.pts]
            p.moveTo(*pts[0])
            for q in pts[1:]:
                p.lineTo(*q)
            c.drawPath(p, stroke=1, fill=0)
            if el.arrow:
                (x1, y1), (x2, y2) = pts[-2], pts[-1]
                hl = el.sw * s * 3.2
                n = math.hypot(x2 - x1, y2 - y1) or 1
                ux, uy = (x2 - x1) / n, (y2 - y1) / n      # the head points along the line, any direction
                c.setFillColor(rgb(el.stroke))
                t = c.beginPath()
                t.moveTo(x2 + ux * hl * 0.4, y2 + uy * hl * 0.4)
                t.lineTo(x2 - ux * hl - uy * hl * 0.6, y2 - uy * hl + ux * hl * 0.6)
                t.lineTo(x2 - ux * hl + uy * hl * 0.6, y2 - uy * hl - ux * hl * 0.6)
                t.close()
                c.drawPath(t, stroke=0, fill=1)
        elif k == "text":
            self._text(el, dx, dy)
        elif k in ("icon", "image", "video"):
            path = (art.icon_png(el.name, el.color, el.sw, max(64, int(el.w * 3))) if k == "icon"
                    else el.poster if k == "video" else el.name)
            c.drawImage(path, self.X(el.x + dx), self.Y(el.y + dy + el.h), el.w * s, el.h * s, mask="auto")
        c.restoreState()
        if el.link:   # clickable area over the element (a group's box is its children's)
            kids = el.children or [el]
            x0, y0 = min(ch.x for ch in kids), min(ch.y for ch in kids)
            x1, y1 = max(ch.x + ch.w for ch in kids), max(ch.y + ch.h for ch in kids)
            self.c.linkURL(el.link, (self.X(x0 + dx), self.Y(y1 + dy), self.X(x1 + dx), self.Y(y0 + dy)), relative=0)

    def _text(self, el, dx, dy):
        c, s = self.c, self.s
        lines = [[(t, el.size, el.color, el.bold)] for t in el.text.split("\n")] if not getattr(el, 'runs', None) else [el.runs]
        lh = max(r[1] for ln in lines for r in ln) * 1.2
        top = el.y + dy + el.h / 2 - lh * len(lines) / 2
        for i, runs in enumerate(lines):
            widths = [pdfmetrics.stringWidth(t, "Sans-Bold" if b else "Sans", sz * s) for t, sz, _c, b in runs]
            total = sum(widths)
            left = {"l": self.X(el.x + dx), "c": self.X(el.x + dx + el.w / 2) - total / 2,
                    "r": self.X(el.x + dx + el.w) - total}[el.align]
            big = max(r[1] for r in runs)
            base = self.Y(top + i * lh + lh / 2) - big * s * 0.35
            for (t, sz, color, b), wdt in zip(runs, widths):
                c.setFont("Sans-Bold" if b else "Sans", sz * s)
                c.setFillColor(rgb(color))
                c.drawString(left, base, t)
                left += wdt

    def slide(self, els, title=False):
        self.c.drawImage(art.background(arcs=title), self.X(0), self.Y(H), W * self.s, H * self.s)
        for el in els:
            self.draw(el)


# ── handout ─────────────────────────────────────────────────────────────────

CAPTIONS = {
    "title": "How the Bahamas can turn CORSIA's authorisation bottleneck into blue-carbon credits airlines can trust and buy.",
    "intro": "Michael Strachan, CEO of BACSWN (SkyWatch Bahamas). Today: the system as it stands, the problems, our solution, a demo, and a recap.",
    "system": "The Bahamas has the pieces: a 2022 carbon market law, a national emissions registry, a blue carbon programme, and airlines under CORSIA that need 200–250 million eligible units by January 2028.",
    "problems": "They don't connect: no letter of authorisation has been signed, claims can't be independently checked, and storms blind the evidence (Freeport's reports stopped for 10½ days in Dorian). Zero Bahamian credits reach airlines.",
    "solution": "The state's own evidence: BACSWN already runs the weather and airspace network over The Bahamas, and turns that data into evidence the government can use to sign, check and price credits. AI reads and checks each letter of authorisation; every claim is checked against observed flights and the registry; hardened stations measure every storm at each project site; so buffers follow real risk and credits become bankable.",
    "demo-1": "Live demo: a letter of authorisation read by AI and checked against the national registry; then the register catches a double claim and unauthorised units. A person still decides.",
    "demo-2": "Live demo: Hurricane Dorian (NOAA best track) replayed over illustrative blue-carbon projects — 0 to 35 hours of hurricane-force winds, so buffers can follow the real risk.",
    "recap": "The signature, trust and the weather: each problem, and how we solve it. Together they make Caribbean blue carbon bankable.",
    "questions": "Questions. Explore the demos on your phone with the QR code.",
}
SOURCES = [
    "Government of The Bahamas, Climate Change and Carbon Market Initiatives Act 2022; National Emissions Registry.",
    "Office of the Prime Minister, remarks on the Blue Carbon Programme and the emissions registry (Sep 2026).",
    "The Tribune, “PM: Measured progress over blue carbon credits” and “$25m plan to harness blue carbon” (25 Sep 2026); “Blue carbon spend to $100m” (12 Nov 2026).",
    "IATA, Supporting Alliance for CORSIA EEU Supply; ICAO joins (13 Oct 2026); CORSIA at ten (6 Oct 2026) — iata.org pressroom.",
    "ICAO, statement on CORSIA's tenth anniversary (Oct 2026) — icao.int.",
    "NOAA National Hurricane Center, HURDAT2 best track, Hurricane Dorian (AL052019) — nhc.noaa.gov/data/hurdat.",
    "Iowa Environmental Mesonet, ASOS/METAR archive, MYGF and MYNN, Aug–Sep 2019 — mesonet.agron.iastate.edu.",
]
INK = colors.HexColor("#0f172a")
MUTED = colors.HexColor("#475569")
BODY = ParagraphStyle("body", fontName="Sans", fontSize=10, leading=14, textColor=INK)
SMALL = ParagraphStyle("small", fontName="Sans", fontSize=8.5, leading=12, textColor=INK)
FINE = ParagraphStyle("fine", fontName="Sans", fontSize=8, leading=11, textColor=MUTED)


def _para(cv, text, style, x, y_top, width):
    p = Paragraph(text, style)
    _w, h = p.wrap(width, 1000)
    p.drawOn(cv, x, y_top - h)
    return h


def handout(out_path, demo_source):
    import tempfile
    import pptx_out
    PW, PH = 297 * mm, 167.22 * mm
    cv = canvas.Canvas(str(out_path), pagesize=(PW, PH))
    cv.setTitle(f"{DECK['title']} — handout")
    cv.setAuthor(DECK["speaker"])
    margin = 14 * mm
    box_h = 106 * mm
    sc = box_h / H
    box_w = W * sc
    videos = pptx_out.demo_media(demo_source, Path(tempfile.mkdtemp()))
    pages = [(s["headline"], els, s["kind"] in ("title", "intro"), CAPTIONS[s["id"]]) for s, els in slides(videos)]
    for n, (head, els, title, cap) in enumerate(pages, 1):
        cv.setFont("Sans-Bold", 15)
        cv.setFillColor(INK)
        cv.drawString(margin, PH - 9 * mm - 12, head)
        ox, oy = (PW - box_w) / 2, 9 * mm + 22
        Stage(cv, PH, ox, oy, sc).slide(els, title=title)
        _para(cv, escape(cap), BODY, margin, PH - oy - box_h - 4 * mm, PW - 2 * margin)
        cv.setFont("Sans", 8); cv.setFillColor(MUTED)
        cv.drawRightString(PW - 10 * mm, 6 * mm, str(n))
        cv.showPage()
    # explore the demos and sources
    cv.drawImage(art.qr_png(), margin, PH - 10 * mm - 34 * mm, 34 * mm, 34 * mm)
    tx = margin + 42 * mm
    cv.setFont("Sans-Bold", 15); cv.setFillColor(INK)
    cv.drawString(tx, PH - 22 * mm, "Explore the demos")
    cv.setFont("Sans-Bold", 10)
    cv.drawString(tx, PH - 28 * mm, "http://" + DECK["joinUrl"])
    cv.setFont("Sans", 10)
    cv.drawString(tx, PH - 33 * mm, "The credit journey, checking a claim and the Dorian replay, on your phone.")
    y = PH - 52 * mm
    cv.setFont("Sans-Bold", 12)
    cv.drawString(margin, y, "Sources")
    y -= 3 * mm
    for src in SOURCES:
        y -= _para(cv, "• " + escape(src), SMALL, margin, y, PW - 2 * margin) + 1
    _para(cv, escape(f"{DECK['companion']['note']} {DECK['speaker']} · {DECK['event']}"), FINE, margin, y - 4 * mm, PW - 2 * margin)
    cv.setFont("Sans", 8); cv.setFillColor(MUTED)
    cv.drawRightString(PW - 10 * mm, 6 * mm, str(len(pages) + 1))
    cv.showPage()
    cv.save()
    return len(pages) + 1


# ── speaker notes ───────────────────────────────────────────────────────────

def _notes_markup(text):
    t = xesc(text)
    return re.sub(r"\[([^\]]*)\]", r'<font color="#b45309"><b>[\1]</b></font>', t)


def speaker_notes(out_path):
    st = {
        "h1": ParagraphStyle("h1", fontName="Sans-Bold", fontSize=18, leading=22, textColor=INK, spaceAfter=2),
        "meta": ParagraphStyle("meta", fontName="Sans", fontSize=10, leading=14, textColor=MUTED, spaceAfter=10),
        "h2": ParagraphStyle("h2", fontName="Sans-Bold", fontSize=12.5, leading=16, textColor=INK, spaceBefore=10, spaceAfter=5),
        "h3": ParagraphStyle("h3", fontName="Sans-Bold", fontSize=12, leading=15, textColor=INK),
        "when": ParagraphStyle("when", fontName="Sans", fontSize=9.5, leading=13, textColor=MUTED, spaceAfter=3),
        "cue": ParagraphStyle("cue", fontName="Sans", fontSize=9.5, leading=13, textColor=INK, backColor=colors.HexColor("#f1f5f9"),
                              borderColor=colors.HexColor("#0284c7"), borderPadding=(3, 4, 3, 6), leftIndent=6, spaceAfter=6, spaceBefore=2),
        "body": ParagraphStyle("nb", fontName="Sans", fontSize=10.5, leading=15, textColor=INK, alignment=TA_LEFT),
        "cell": ParagraphStyle("cell", fontName="Sans", fontSize=9.5, leading=12, textColor=INK),
        "cellb": ParagraphStyle("cellb", fontName="Sans-Bold", fontSize=9.5, leading=12, textColor=INK),
    }
    agenda = [a["label"] for a in DECK["agenda"]]
    doc = SimpleDocTemplate(str(out_path), pagesize=A4, leftMargin=17 * mm, rightMargin=17 * mm, topMargin=16 * mm,
                            bottomMargin=16 * mm, title=f"{DECK['title']} — speaker notes", author=DECK["speaker"])
    flow = [Paragraph(xesc(f"{DECK['title']} — speaker notes"), st["h1"]),
            Paragraph(xesc(f"{DECK['speaker']} · {DECK['event']} · about {sum(s['minutes'] for s in DECK['slides']):g} minutes, then questions"), st["meta"]),
            Paragraph("The story", st["h2"]),
            Paragraph("Tell them what you'll tell them (slide 1: who you are and the agenda), tell them (the system today, the "
                      "problems, our solution, then the demos), and tell them what you told them (the recap), then questions. Every "
                      "point is an icon, and the points come in one after another within a few seconds of the slide opening; the agenda across the top shows where "
                      "you are.", st["body"]),
            Paragraph("How to drive it", st["h2"]),
            _drive_table(st, grid_style()),
            Paragraph("Run sheet", st["h2"])]
    rows = [[Paragraph(h, st["cellb"]) for h in ("#", "Slide", "Part", "Starts", "Min")]]
    t, blocks = 0.0, []
    cues = {"intro": "Click “Start the presentation” at the bottom of the screen: the deck goes full screen and runs by itself.",
            "questions": "This slide stays up until you move on."}
    for i, s in enumerate(DECK["slides"], 1):
        start = f"{int(t)}:{int(round((t % 1) * 60)):02d}"
        act = agenda[s["stage"] - 1] if s.get("stage") else ("Opening" if s["kind"] in ("title", "intro") else "Close")
        rows.append([Paragraph(str(i), st["cell"]), Paragraph(xesc(s["headline"]), st["cell"]), Paragraph(xesc(act), st["cell"]),
                     Paragraph(start, st["cell"]), Paragraph(f"{s['minutes']:g}" if s["minutes"] else "open", st["cell"])])
        cue = cues.get(s["id"])
        if s["kind"] == "demo":
            cue = ("Live demo, on the slide itself: click and use it in the panel on the right. “Live demo” under a step "
                   "switches demos; the square button above the panel opens it full screen, and “Open in new tab” opens it in its own browser tab. This slide waits for you: press → "
                   "when you're done (move the mouse off the demo first). In the PowerPoint backup the recording plays here.")
        length = f"about {s['minutes']:g} min" if s["minutes"] else "as long as the questions last"
        block = [Paragraph(xesc(f"{i}. {s['headline']}"), st["h3"]),
                 Paragraph(xesc(f"{act} · starts at {start} · {length}"), st["when"])]
        if cue:
            block.append(Paragraph(xesc(cue), st["cue"]))
        block += [Paragraph(_notes_markup(s["notes"]), st["body"]), Spacer(1, 9)]
        blocks.append(KeepTogether(block))
        t += s["minutes"]
    grid = grid_style()
    flow.append(Table(rows, colWidths=[9 * mm, 66 * mm, 55 * mm, 22 * mm, 22 * mm], style=grid, repeatRows=1))
    flow.append(Paragraph("Notes", st["h2"]))
    flow += blocks
    doc.build(flow)


# ── how to drive it: shared by the speaker notes and the one-page guide ─────────

DRIVE = [
    ("1. Open it", "On the laptop, log in at http://78.47.104.139:8088 with the login you were given. On the Command Center, "
                   "press the blue “Presentation” button at the top."),
    ("2. Start", "Click the blue “Start the presentation” button at the bottom of the screen. The deck goes full screen and runs by itself from "
                 "slide 1. You don't need to touch anything to move on."),
    ("3. Just talk", "Speak from your notes at a normal pace. Each slide's icons and arrows are all on screen within a few seconds, and each "
                     "slide moves on when you've finished it (except the two demo slides, which wait for you)."),
    ("4. Ahead of the slides?", "Press → on the clicker or keyboard (or the → button bottom right). It brings in the next "
                                "point now, or the next slide once every point is showing."),
    ("5. Need more time?", "Press P, or the middle round button bottom right, to pause; a question from the floor, a sip of "
                           "water. Press it again to carry on. The thin bar on that button shows the slide's time."),
    ("6. Live demos (slides 5 and 6)", "The demo is live on the slide itself, on the right: click and use it right there. "
                                       "“Live demo” under a step switches the panel to that demo; the square button above the "
                                       "panel opens it full screen (the round ← at its top right comes back, and the show carries "
                                       "on by itself). Demo slides wait for you: press → when you're done. If you clicked inside "
                                       "the demo, move the mouse off it before using the clicker."),
    ("7. Questions", "The last slide stays up until you finish. Its QR code lets the audience try the demos on their phones."),
    ("Went too far?", "Press ← (or the ← button bottom right) to go back a slide; it shows complete."),
    ("Left full screen?", "Press F, or the small square button that appears at the bottom left when you move the mouse there."),
    ("Page reloaded?", "It reopens on the same slide. Click the play arrow again to carry on."),
    ("Your notes on screen", "N shows or hides the notes for the current slide, on the laptop screen (the audience sees them "
                             "too if the screen is mirrored, so use it only for rehearsal)."),
    ("Backup: PowerPoint", "If the internet fails, open Paris_From_Bottleneck_to_Bankable_laptop.pptx and start the slide show "
                           "from the beginning. It runs by itself the same way, the arrows bottom right move between slides, "
                           "and the demo slides play recordings of the demos. The blue buttons under each recording open the live "
                           "demo itself in the browser (log in at http://78.47.104.139:8088 on the laptop beforehand)."),
]


def grid_style():
    return TableStyle([("LINEBELOW", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")), ("VALIGN", (0, 0), (-1, -1), "TOP"),
                       ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4)])


def _drive_table(st, grid):
    return Table([[Paragraph(xesc(a), st["cellb"]), Paragraph(xesc(b), st["cell"])] for a, b in DRIVE],
                 colWidths=[46 * mm, 128 * mm], style=grid)


def driving_guide(out_path):
    """One A4 page for the presenter: how to start, steer and recover the self-running deck."""
    st = {
        "h1": ParagraphStyle("gh1", fontName="Sans-Bold", fontSize=20, leading=25, textColor=INK, spaceAfter=3),
        "meta": ParagraphStyle("gm", fontName="Sans", fontSize=10.5, leading=14, textColor=MUTED, spaceAfter=10),
        "cell": ParagraphStyle("gc", fontName="Sans", fontSize=10.5, leading=14.5, textColor=INK),
        "cellb": ParagraphStyle("gcb", fontName="Sans-Bold", fontSize=10.5, leading=14.5, textColor=INK),
        "tip": ParagraphStyle("gt", fontName="Sans", fontSize=10.5, leading=14.5, textColor=INK, backColor=colors.HexColor("#f1f5f9"),
                              borderColor=colors.HexColor("#0284c7"), borderPadding=(6, 6, 6, 8), spaceBefore=12),
    }
    doc = SimpleDocTemplate(str(out_path), pagesize=A4, leftMargin=17 * mm, rightMargin=17 * mm, topMargin=16 * mm,
                            bottomMargin=14 * mm, title=f"{DECK['title']} — how to drive the presentation", author=DECK["speaker"])
    doc.build([Paragraph("How to drive the presentation", st["h1"]),
               Paragraph(xesc(f"{DECK['title']} · {DECK['speaker']} · {DECK['event']}"), st["meta"]),
               _drive_table(st, grid_style()),
               Paragraph("<b>The one thing to remember:</b> the deck drives itself. Talk naturally; use → if you're ahead, "
                         "P if you need a moment, and the round ← at the top right to come back from a demo.", st["tip"])])
