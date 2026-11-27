"""The Paris deck as drawing instructions, shared by the PowerPoint and PDF renderers.

Every slide is a list of elements laid out on the same 1920x1080 stage as the web deck
(PresentParis.jsx / present.css), in pixels. Each point of the talk is an icon in a column;
an arrow draws down from each icon to the next. An element may carry an animation: an entrance effect
starting `at` milliseconds after the slide opens, on the same schedule the web deck uses.
The PowerPoint renderer turns these into native shapes and animations; the PDF renderer
draws the final frame.
"""
import json
from dataclasses import dataclass, field
from pathlib import Path

ASSETS = Path(__file__).resolve().parent / "assets"
DECK = json.loads((ASSETS / "paris-deck.json").read_text())
DEMO_BASE = "http://" + DECK["joinUrl"].rsplit("/", 1)[0]   # the live deck's server: demos open from here

W, H = 1920, 1080
C = {  # the web deck's palette
    "bg": "070d1a", "ink": "f1f5f9", "dim": "94a3b8", "ok": "34d399", "bad": "f87171", "accent": "38bdf8",
    "gold": "facc15", "card": "111a2e", "line": "24324d", "arrow": "64748b", "dark": "04111f", "rail": "475569",
}


@dataclass
class Anim:
    effect: str = "fade"        # fade | zoom | wipe | rise
    at: int = 0                 # ms after the slide opens
    dur: int = 500
    dir: str = "left"           # wipe: the edge it starts from (left | top)


@dataclass
class El:
    kind: str                   # rect | ellipse | line | text | icon | image | video | group
    x: float = 0
    y: float = 0
    w: float = 0
    h: float = 0
    fill: str | None = None
    stroke: str | None = None
    sw: float = 0               # stroke width, px
    radius: float = 0
    alpha: float = 1.0
    text: str = ""
    size: float = 0             # font size, px
    bold: bool = False
    color: str = "ink"
    align: str = "c"            # l | c | r
    name: str = ""              # icon name, or image/video path
    poster: str = ""            # video poster frame
    pts: list = field(default_factory=list)
    arrow: bool = False
    children: list = field(default_factory=list)
    anim: Anim | None = None
    label: str = ""             # alt text
    runs: list = field(default_factory=list)   # [(text, size, color, bold)] for mixed text
    gradient: tuple | None = None
    rot: float = 0
    link: str = ""              # web address opened when the element is clicked


def col(c):
    return C.get(c, c)


# One colour per theme of the talk, as on the web deck (supply amber, integrity teal, blue carbon blue).
THEME_COLOURS = ["fbbf24", "2dd4bf", "38bdf8"]


def theme_colour(name):
    """Colour for a theme named in the deck (falls back to gold)."""
    themes = DECK.get("themes", [])
    return THEME_COLOURS[themes.index(name)] if name in themes else "gold"


def islands(faint=False):
    """Faint outline of the Bahamas behind the opening and closing slides (decorative)."""
    return El("image", 0, 0, W, H, name=str(ASSETS / ("islands-faint.png" if faint else "islands.png")),
              label="Decorative: outline of the Bahamas islands", anim=Anim("fade", 0, 2000))


_LUCIDE = {"FileSignature": "file-signature", "ClipboardCheck": "clipboard-check", "RadioTower": "radio-tower",
           "BadgeCheck": "badge-check", "CopyX": "copy-x", "MapPin": "map-pin", "ShieldCheck": "shield-check",
           "TrendingUp": "trending-up", "FileCheck2": "file-check-2", "SearchCheck": "search-check", "FileX": "file-x",
           "CloudLightning": "cloud-lightning", "TriangleAlert": "triangle-alert", "ListChecks": "list-checks",
           "MonitorPlay": "monitor-play", "UserRound": "user-round", "MessageCircleQuestion": "message-circle-question"}


def lucide(name):
    """Deck icon names (Lucide's React names) to icon file names."""
    return _LUCIDE.get(name, name if name.islower() else name.lower())


# ── timing: the same schedule as the web deck ──────────────────────────────

def steps_of(s):
    if s["kind"] == "title":
        return 2
    if s["kind"] == "intro":
        return len(DECK["agenda"])
    if s["kind"] == "recap":
        return len(s["rows"]) + 1
    if s["kind"] == "questions":
        return 1
    return len(s["items"])


WPM = DECK.get("wpm", 140)   # the natural speaking pace the timings assume


def _spoken(notes):
    """The notes as spoken: checks in [brackets] are not read out."""
    import re
    return re.sub(r"\[[^\]]*\]", "", notes or "")


def schedule(s, span_ms=None):
    """When each step appears (ms): when the presenter reaches its cue phrase in the notes, at WPM.

    The same rule as the web deck; steps without a cue follow two seconds after the one before.
    """
    t = _spoken(s.get("notes"))
    out = []
    cues = s.get("cues") or []
    for i in range(steps_of(s)):
        cue = cues[i] if i < len(cues) else None
        k = t.find(cue) if cue else -1
        out.append(int(800 + len(t[:k].split()) * 60000 / WPM) if k >= 0 else (out[-1] + 2000 if out else 800))
    return out


# ── building blocks ─────────────────────────────────────────────────────────

def text(x, y, w, h, t, size, color="ink", bold=False, align="c", anim=None):
    return El("text", x, y, w, h, text=t, size=size, color=color, bold=bold, align=align, anim=anim)


def headline(t):
    return text(160, 120, 1600, 110, t, 96, bold=True, anim=Anim("rise", 0, 700))


def icon(name, cx, cy, size, color, sw=2.0):
    return El("icon", cx - size / 2, cy - size / 2, size, size, name=lucide(name), color=color, sw=sw, label=name)


def rail(stage):
    """The agenda across the top; the part of the talk on screen lit, earlier parts green."""
    out, x = [], 445
    widths = [248, 205, 190, 115, 125]
    for i, (a, w) in enumerate(zip(DECK["agenda"], widths), start=1):
        tone = "gold" if i == stage else "ok" if i < stage else "rail"
        out.append(icon(a["icon"], x + 15, 50, 30, tone, 2.25))
        out.append(text(x + 40, 30, w, 40, a["label"], 24, tone, True, "l"))
        x += 40 + w + 44 - 4
    return out


def varrow(x, y1, y2, tone, at):
    """An arrow that wipes in from the top, pointing down to the next icon."""
    return El("line", pts=[(x, y1), (x, y2)], stroke=col(tone), sw=6, arrow=True, anim=Anim("wipe", at, 550, "top"), label="then")


def point(item, x, y, r, tone, at, after_arrow, w, lbl=40, det=28):
    """An icon in a ring, with its theme, label and detail to its right; pops in after the arrow to it."""
    t0 = at + (550 if after_arrow else 0)
    ring = {"accent": "accent", "bad": "bad", "ok": "ok", "agenda": "line"}[tone]
    ic = "accent" if tone == "agenda" else tone
    els = [El("group", label=item["label"], anim=Anim("zoom", t0, 500), children=[
        El("ellipse", x - r, y - r, 2 * r, 2 * r, fill=col("card"), stroke=col(ring), sw=4 if tone == "agenda" else 5),
        icon(item["icon"], x, y, r * 1.04, ic, 1.75)])]
    tx = x + r + 40
    detail = _wrap(item["detail"], det, w) if item.get("detail") else ""
    nd = detail.count("\n") + 1 if detail else 0
    th, lh, dh = (28 if item.get("theme") else 0), lbl * 1.25, (nd * det * 1.3 + 6 if detail else 0)
    top = y - (th + lh + dh) / 2                 # the text block is centred on the ring, as on the web
    if th:
        els.append(text(tx, top, w, th, item["theme"].upper(), 22, theme_colour(item["theme"]), True, "l", Anim("fade", t0 + 200, 500)))
    els.append(text(tx, top + th, w, lh, item["label"], lbl, bold=True, align="l", anim=Anim("rise", t0 + 300, 500)))
    if detail:
        els.append(text(tx, top + th + lh + 6, w, dh - 6, detail, det, "dim", align="l", anim=Anim("rise", t0 + 500, 500)))
    return els


def column(items, sch, x, y0, y1, r, tone, w, **kw):
    """Points down a column joined by arrows, each on its step's time."""
    ys, els = spread(len(items), y0, y1), []
    for i, (it, at) in enumerate(zip(items, sch)):
        if i:
            els.append(varrow(x, ys[i - 1] + r + 14, ys[i] - r - 14, "arrow" if tone == "agenda" else tone, at))
        els += point(it, x, ys[i], r, tone, at, i > 0, w, **kw)
    return els


def _wrap(t, size, width):
    """Break text into lines that fit `width` px, measured with Liberation Sans (Arial's metrics)."""
    font = _measure_font(size)
    fits = (lambda x: font.getlength(x) <= width * 0.97) if font else (lambda x: len(x) <= int(width / (size * 0.52)))
    lines, line = [], ""
    for w in t.split():
        cand = f"{line} {w}".strip()
        if line and not fits(cand):
            lines.append(line)
            line = w
        else:
            line = cand
    return "\n".join(lines + [line])


def _measure_font(size, _cache={}):
    if size not in _cache:
        from PIL import ImageFont
        path = Path("/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf")
        try:
            _cache[size] = ImageFont.truetype(str(path), int(round(size)))
        except OSError:
            _cache[size] = None
    return _cache[size]


def spread(n, y0, y1):
    return [(y0 + y1) / 2] if n == 1 else [y0 + i * (y1 - y0) / (n - 1) for i in range(n)]


def source(t):
    return text(64, 1022, 1500, 30, t, 20, "dim", align="l")


# ── slides ──────────────────────────────────────────────────────────────────

def left_headline(s):
    """Headline at the top left (column slides), with the optional one-line explanation under it."""
    els = [text(140, 100, 1640, 96, s["headline"], 80, bold=True, align="l", anim=Anim("rise", 0, 700))]
    if s.get("sub"):
        els.append(text(140, 206, 1640, 84, _wrap(s["sub"], 30, 1640), 30, "dim", align="l", anim=Anim("rise", 200, 700)))
    return els


def title_slide(s):
    sch = schedule(s)
    els = [islands(),
           text(0, 150, W, 136, s["headline"], 120, bold=True, anim=Anim("rise", 0, 800)),
           text(260, 300, 1400, 180, _wrap(s["sub"], 44, 1250), 44, "dim", anim=Anim("rise", 300, 800))]
    els += point(s["from"], 840, 600, 64, "bad", sch[0], False, 400, lbl=32)
    els.append(varrow(840, 678, 772, "ok", sch[1]))
    els += point(s["to"], 840, 850, 64, "ok", sch[1], True, 400, lbl=32)
    els.append(text(0, 978, W, 34, DECK["event"], 26, "dim", anim=Anim("fade", 600, 800)))
    return els


def intro_slide(s):
    p = DECK["presenter"]
    els = [islands(), headline(s["headline"]),
           El("group", label=f"{p['name']}, {p['role']}, {p['org']}", anim=Anim("fade", 400, 800), children=[
               El("ellipse", 140, 380, 170, 170, fill=col("card"), stroke=col("gold"), sw=5),
               icon("UserRound", 225, 465, 96, "gold", 1.75),
               text(350, 370, 700, 74, p["name"], 64, bold=True, align="l"),
               text(350, 444, 700, 54, f"{p['role']}, {p['org']}", 44, "gold", True, "l"),
               text(350, 500, 640, 76, _wrap(p["tagline"], 28, 600), 28, "dim", align="l")])]
    return els + column(DECK["agenda"], schedule(s), 1240, 320, 920, 44, "agenda", 440, lbl=32)


def chain_slide(s):
    y0 = 380 if s.get("sub") else 310
    els = left_headline(s) + column(s["items"], schedule(s), 200, y0, 900, 52, s.get("tone", "accent"), 1250)
    if s.get("source"):
        els.append(source(s["source"]))
    return els


def demo_slide(s, video):
    """The demo steps down a column on the left; the recording of the live demo plays on the right."""
    sch = schedule(s)
    els = [text(140, 100, 1640, 96, s["headline"], 80, bold=True, align="l", anim=Anim("rise", 0, 700))]
    els += column(s["items"], sch, 180, 340, 860, 46, "accent", 440, lbl=30, det=22)
    if video:
        path, poster, _sec = video
        els.append(El("video", 824, 300, 1024, 576, name=str(path), poster=str(poster),
                      label=f"Recording of the live demo: {s['headline']}", anim=Anim("fade", sch[-1] + 1500, 600)))
    # A button under the recording for each live demo: clicking it opens the real demo in the browser.
    demos = [it["demo"] for it in s["items"] if it.get("demo")]
    bw = (1024 - 32 * (len(demos) - 1)) / max(1, len(demos))
    for k, d in enumerate(demos):
        x, url = 824 + k * (bw + 32), DEMO_BASE + d["path"]
        els.append(El("group", label=f"Open the live demo: {d['label']} ({url})", link=url, anim=Anim("fade", 0, 600), children=[
            El("rect", x, 904, bw, 64, radius=32, fill=col("card"), stroke=col("accent"), sw=3),
            icon("MonitorPlay", x + 44, 936, 34, "accent", 2.25),
            text(x + 76, 904, bw - 96, 64, d["label"], 26, "accent", True, "l")]))
    return els


def recap_slide(s):
    """One column per theme: its problem, an arrow down, its fix; then the outcome."""
    els = [headline(s["headline"])]
    sch = schedule(s)
    for i, (r, at) in enumerate(zip(s["rows"], sch)):
        x = [420, 960, 1500][i]
        els.append(El("group", label=f"{r['topic']}: {r['problem']['label']}", anim=Anim("rise", at, 500), children=[
            text(x - 260, 270, 520, 80, _wrap(r["topic"], 30, 500), 30, theme_colour(r["topic"]), True),
            El("ellipse", x - 55, 374, 110, 110, fill=col("card"), stroke=col("bad"), sw=5),
            icon(r["problem"]["icon"], x, 429, 56, "bad", 2),
            text(x - 260, 498, 520, 46, r["problem"]["label"], 38, "bad", True)]))
        els.append(varrow(x, 560, 636, "ok", at + 200))
        els.append(El("group", label=r["fix"]["label"], anim=Anim("zoom", at + 750, 500), children=[
            El("ellipse", x - 55, 654, 110, 110, fill=col("card"), stroke=col("ok"), sw=5),
            icon(r["fix"]["icon"], x, 709, 56, "ok", 2),
            text(x - 260, 778, 520, 46, r["fix"]["label"], 38, "ok", True)]))
    res = s["result"]
    els.append(El("group", label=res["label"], anim=Anim("zoom", sch[-1], 600), children=[
        El("ellipse", 610, 900, 110, 110, fill=col("card"), stroke=col("gold"), sw=5),
        icon(res["icon"], 665, 955, 56, "gold", 2),
        text(748, 915, 700, 80, res["label"], 60, "gold", True, "l")]))
    return els


def questions_slide(s):
    p = DECK["presenter"]
    # The question on the left, a large QR code to the phone demos on the right (as on the web deck).
    return [islands(faint=True),
            icon("MessageCircleQuestion", 720, 320, 260, "accent", 1.5) | _with(Anim("zoom", 0, 700)),
            text(0, 500, 1440, 150, s["headline"], 130, bold=True, anim=Anim("rise", 300, 700)),
            text(0, 690, 1440, 50, f"{p['name']} · {p['role']}, {p['org']}", 40, "dim", anim=Anim("fade", 600, 700)),
            El("group", label="QR code to the phone demos", anim=Anim("fade", 1200, 600), children=[
                El("rect", 1300, 300, 400, 400, radius=20, fill="ffffff"),
                El("image", 1318, 318, 364, 364, name=str(ASSETS / "qr-live.png"), label=f"QR code: {DECK['joinUrl']}"),
                text(1240, 724, 520, 50, "Try the demos on your phone", 34, "gold", True)])]


class _with:
    """`element | _with(anim)` attaches an animation to an element built by a helper."""

    def __init__(self, anim):
        self.anim = anim

    def __ror__(self, el):
        el.anim = self.anim
        return el


def slides(demo_videos=None):
    """The show in order: [(slide dict, elements)]. demo_videos: {slide id: (mp4, poster png, seconds)}."""
    out = []
    for s in DECK["slides"]:
        k = s["kind"]
        if k == "title":
            els = title_slide(s)
        elif k == "intro":
            els = intro_slide(s)
        elif k == "recap":
            els = recap_slide(s)
        elif k == "questions":
            els = questions_slide(s)
        elif k == "demo":
            els = demo_slide(s, (demo_videos or {}).get(s["id"]))
        else:
            els = chain_slide(s)
        if s.get("stage"):
            els = rail(s["stage"]) + els
        out.append((s, els))
    return out
