"""Build the PDF editions of the help documents in docs/help/*.md.

    python scripts/build_help_pdfs.py            # writes docs/help/<name>.pdf next to each .md

Handles the Markdown the help docs use: headings, paragraphs, bullet and numbered lists, tables,
fenced code, **bold**, `code` and bare URLs. Each PDF records the SHA-256 of its source in the
document subject, so tests/test_help_docs.py can tell when a PDF is older than its Markdown.
"""

import hashlib
import re
import sys
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (Image, KeepTogether, ListFlowable, ListItem, Paragraph, Preformatted,
                                SimpleDocTemplate, Spacer, Table, TableStyle)

ROOT = Path(__file__).resolve().parent.parent
HELP = ROOT / "docs" / "help"
FONT_DIR = Path("/usr/share/fonts/truetype/dejavu")

# DejaVu covers the arrows and dashes in the docs; the built-in PDF fonts don't
pdfmetrics.registerFont(TTFont("Sans", FONT_DIR / "DejaVuSans.ttf"))
pdfmetrics.registerFont(TTFont("Sans-Bold", FONT_DIR / "DejaVuSans-Bold.ttf"))
pdfmetrics.registerFont(TTFont("Mono", FONT_DIR / "DejaVuSansMono.ttf"))
pdfmetrics.registerFontFamily("Sans", normal="Sans", bold="Sans-Bold", italic="Sans", boldItalic="Sans-Bold")

INK = colors.HexColor("#1b2430")
MUTED = colors.HexColor("#5b6675")
ACCENT = colors.HexColor("#2563eb")
RULE = colors.HexColor("#d5dbe3")
CODE_BG = colors.HexColor("#f2f4f7")

BODY = ParagraphStyle("body", fontName="Sans", fontSize=9.5, leading=13.5, textColor=INK, spaceAfter=5)
H1 = ParagraphStyle("h1", parent=BODY, fontName="Sans-Bold", fontSize=20, leading=24, spaceAfter=10)
H2 = ParagraphStyle("h2", parent=BODY, fontName="Sans-Bold", fontSize=13.5, leading=17, spaceBefore=12,
                    spaceAfter=5, textColor=ACCENT)
H3 = ParagraphStyle("h3", parent=BODY, fontName="Sans-Bold", fontSize=10.5, leading=14, spaceBefore=7, spaceAfter=3)
CELL = ParagraphStyle("cell", parent=BODY, fontSize=8.5, leading=11.5, spaceAfter=0)
CELL_HEAD = ParagraphStyle("cellh", parent=CELL, fontName="Sans-Bold")
CAPTION = ParagraphStyle("caption", parent=BODY, fontSize=8, leading=10.5, textColor=MUTED, spaceAfter=8)
CODE = ParagraphStyle("code", fontName="Mono", fontSize=7.8, leading=10.2, textColor=INK)


def inline(text: str) -> str:
    """Markdown inline markup -> reportlab paragraph markup (escaped first)."""
    out, parts = [], re.split(r"(`[^`]+`)", text)
    for part in parts:
        if part.startswith("`") and part.endswith("`") and len(part) > 1:
            out.append(f'<font name="Mono" size="8.5" backColor="#eef1f5">{escape(part[1:-1])}</font>')
            continue
        s = escape(part)
        s = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", s)
        s = re.sub(r"(https?://[^\s<)]+[^\s<).,;:])", r'<link href="\1" color="#2563eb">\1</link>', s)
        out.append(s)
    return "".join(out)


def _table(rows: list[list[str]], width: float):
    cols = len(rows[0])
    data = [[Paragraph(inline(c), CELL_HEAD if r == 0 else CELL) for c in row + [""] * (cols - len(row))]
            for r, row in enumerate(rows)]
    # First column narrower when the table has a label column and a description column
    widths = [width / cols] * cols if cols != 2 else [width * 0.3, width * 0.7]
    t = Table(data, colWidths=widths, repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e8eef8")),
        ("LINEBELOW", (0, 0), (-1, -1), 0.4, RULE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5), ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    return t


def _cells(line: str) -> list[str]:
    return [c.strip() for c in line.strip().strip("|").split("|")]


IMG_DIR = Path(__file__).resolve().parent.parent / "docs" / "help" / "img"


def _image(path: Path, caption: str, width: float) -> list:
    """A screenshot scaled to the text width (shorter if it would take most of a page), with its caption."""
    if not path.is_file():
        raise SystemExit(f"missing screenshot {path}")
    from reportlab.lib.utils import ImageReader

    w, h = ImageReader(str(path)).getSize()
    draw_w = width
    draw_h = draw_w * h / w
    max_h = 150 * mm
    if draw_h > max_h:
        draw_w, draw_h = draw_w * max_h / draw_h, max_h
    img = Image(str(path), width=draw_w, height=draw_h)
    img.hAlign = "LEFT"
    frame = Table([[img]], colWidths=[draw_w + 2])
    frame.hAlign = "LEFT"
    frame.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#c9d1db")),
                               ("LEFTPADDING", (0, 0), (-1, -1), 1), ("RIGHTPADDING", (0, 0), (-1, -1), 1),
                               ("TOPPADDING", (0, 0), (-1, -1), 1), ("BOTTOMPADDING", (0, 0), (-1, -1), 1)]))
    return [KeepTogether([Spacer(1, 3), frame, Paragraph(inline(caption), CAPTION)])]


def flowables(md: str, width: float) -> tuple[str, list]:
    """(title, flowables) for a Markdown document."""
    lines, story, title, i = md.splitlines(), [], "", 0
    while i < len(lines):
        line = lines[i]
        if not line.strip():
            i += 1
            continue
        if line.startswith("```"):
            j = i + 1
            while j < len(lines) and not lines[j].startswith("```"):
                j += 1
            code = Preformatted("\n".join(lines[i + 1:j]), CODE)
            box = Table([[code]], colWidths=[width])
            box.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), CODE_BG),
                                     ("LEFTPADDING", (0, 0), (-1, -1), 6), ("TOPPADDING", (0, 0), (-1, -1), 5),
                                     ("BOTTOMPADDING", (0, 0), (-1, -1), 5)]))
            story += [box, Spacer(1, 6)]
            i = j + 1
            continue
        shot = re.fullmatch(r"!\[([^\]]*)\]\(img/([a-z0-9-]+\.(?:png|jpg))\)\s*", line)
        if shot:
            story += _image(IMG_DIR / shot.group(2), shot.group(1), width)
            i += 1
            continue
        m = re.match(r"(#{1,3}) (.*)", line)
        if m:
            level, text = len(m.group(1)), m.group(2)
            if level == 1:
                title = text
                story.append(Paragraph(inline(text), H1))
            else:
                story.append(Paragraph(inline(text), H2 if level == 2 else H3))
            i += 1
            continue
        if line.lstrip().startswith("|"):
            rows = []
            while i < len(lines) and lines[i].lstrip().startswith("|"):
                if not re.fullmatch(r"\s*\|?[\s:|-]+\|?\s*", lines[i]):
                    rows.append(_cells(lines[i]))
                i += 1
            story += [_table(rows, width), Spacer(1, 8)]
            continue
        bullet = re.match(r"(\s*)([-*]|\d+\.) (.*)", line)
        if bullet:
            ordered = bullet.group(2)[0].isdigit()
            first = bullet.group(2)[:-1] if ordered else None  # keep "4." after a code block as 4
            items = []
            while i < len(lines):
                b = re.match(r"(\s*)([-*]|\d+\.) (.*)", lines[i])
                if not b:
                    break
                text = b.group(3)
                i += 1
                # Continuation lines of the same item
                while i < len(lines) and lines[i].startswith("   ") and not re.match(r"\s*([-*]|\d+\.) ", lines[i]):
                    text += " " + lines[i].strip()
                    i += 1
                items.append(ListItem(Paragraph(inline(text), BODY), leftIndent=14))
            story.append(ListFlowable(items, bulletType="1" if ordered else "bullet", start=first,
                                      bulletFontName="Sans", bulletFontSize=8.5, leftIndent=14, bulletColor=MUTED))
            story.append(Spacer(1, 3))
            continue
        para = [line.strip()]
        i += 1
        while i < len(lines) and lines[i].strip() and not re.match(r"(#|```|\s*\||\s*([-*]|\d+\.) )", lines[i]):
            para.append(lines[i].strip())
            i += 1
        story.append(Paragraph(inline(" ".join(para)), BODY))
    # Keep each heading with the block that follows it
    out, k = [], 0
    while k < len(story):
        f = story[k]
        if isinstance(f, Paragraph) and f.style in (H2, H3) and k + 1 < len(story):
            out.append(KeepTogether([f, story[k + 1]]))
            k += 2
        else:
            out.append(f)
            k += 1
    return title, out


def source_hash(md_text: str) -> str:
    """Hash of the Markdown and every screenshot it shows, so a changed image also makes the PDF stale."""
    h = hashlib.sha256(md_text.encode("utf-8"))
    for name in re.findall(r"^!\[[^\]]*\]\(img/([a-z0-9-]+\.(?:png|jpg))\)", md_text, flags=re.M):
        path = IMG_DIR / name
        h.update(path.read_bytes() if path.is_file() else b"missing")
    return h.hexdigest()


def build(md_path: Path) -> Path:
    text = md_path.read_text(encoding="utf-8")
    pdf_path = md_path.with_suffix(".pdf")
    doc = SimpleDocTemplate(str(pdf_path), pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm,
                            topMargin=16 * mm, bottomMargin=16 * mm)
    title, story = flowables(text, doc.width)
    doc.title, doc.author = title, "AssetAdvisor"
    doc.subject = f"source-sha256:{source_hash(text)}"
    # Fixed creation date so rebuilding unchanged Markdown gives an identical file
    doc.invariant = True

    def footer(canvas, d):
        canvas.saveState()
        canvas.setFont("Sans", 7.5)
        canvas.setFillColor(MUTED)
        canvas.drawString(d.leftMargin, 9 * mm, title)
        canvas.drawRightString(d.leftMargin + d.width, 9 * mm, f"Page {d.page}")
        canvas.restoreState()

    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    return pdf_path


def main() -> int:
    paths = sorted(HELP.glob("*.md"))
    for p in paths:
        print("built", build(p).relative_to(ROOT))
    return 0 if paths else 1


if __name__ == "__main__":
    sys.exit(main())
