"""Render the deck as a native, editable PowerPoint file with python-pptx.

Every element becomes a real shape (text, circles, arrows, icons as pictures). Entrance
effects are written as PowerPoint timing XML that starts by itself when the slide opens,
so each point's icon and the arrow to the next appear on the web deck's schedule. Every
slide has back and next arrow buttons at the bottom right, and advances by itself after
its speaking time; the demo slides play the recordings of the live demos.
"""
import re
import subprocess
import tempfile
import zipfile
from pathlib import Path

from lxml import etree
from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_CONNECTOR, MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, MSO_AUTO_SIZE, PP_ALIGN
from pptx.oxml.ns import qn
from pptx.util import Emu, Pt

import art
from scenes import DECK, El, H, W, col, lucide, slides

PX = 6350                       # EMU per stage pixel: 1920 px = 13.333 in
FONT = "Arial"
P_NS = "http://schemas.openxmlformats.org/presentationml/2006/main"
ALIGN = {"l": PP_ALIGN.LEFT, "c": PP_ALIGN.CENTER, "r": PP_ALIGN.RIGHT}
CONTROLS = ("Controls: the arrow buttons at the bottom right, the clicker or → / ← move between slides. Each slide builds "
            "by itself and the show moves on after the slide's speaking time.")


def e(v):
    return Emu(int(round(v * PX)))


def rgb(c):
    return RGBColor.from_string(col(c))


def _alt(shape, el):
    if el.label:
        shape._element.xpath("./*[1]/p:cNvPr")[0].set("descr", el.label)


def _fill(shape, el):
    if el.gradient:
        shape.fill.gradient()
        shape.fill.gradient_angle = 0
        stops = shape.fill.gradient_stops
        stops[0].color.rgb, stops[1].color.rgb = rgb(el.gradient[0]), rgb(el.gradient[1])
    elif el.fill:
        shape.fill.solid()
        shape.fill.fore_color.rgb = rgb(el.fill)
        if el.alpha < 1:
            clr = shape.fill._xPr.find(qn("a:solidFill")).find(qn("a:srgbClr"))
            etree.SubElement(clr, qn("a:alpha")).set("val", str(int(el.alpha * 100000)))
    else:
        shape.fill.background()
    if el.stroke:
        shape.line.color.rgb = rgb(el.stroke)
        shape.line.width = e(el.sw)
    else:
        shape.line.fill.background()


def _text(shapes, el):
    tb = shapes.add_textbox(e(el.x), e(el.y), e(el.w), e(el.h))
    tf = tb.text_frame
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    tf.word_wrap = True          # keep the box at its set width so alignment holds (boxes are sized to fit)
    tf.auto_size = MSO_AUTO_SIZE.NONE
    tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    lines = [[(t, el.size, el.color, el.bold)] for t in el.text.split("\n")] if not getattr(el, 'runs', None) else [el.runs]
    for i, runs in enumerate(lines):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = ALIGN[el.align]
        for t, size, color, bold in runs:
            r = p.add_run()
            r.text = t
            f = r.font
            f.name, f.size, f.bold = FONT, Pt(size * 0.5), bold
            f.color.rgb = rgb(color)
    return tb


def draw(shapes, el):
    """Add one element (recursively for groups); returns the shape."""
    k = el.kind
    if k == "group":
        g = shapes.add_group_shape()
        for child in el.children:
            draw(g.shapes, child)
        if el.rot:
            g.rotation = el.rot % 360
        sh = g
    elif k in ("rect", "ellipse"):
        kind = MSO_SHAPE.OVAL if k == "ellipse" else MSO_SHAPE.ROUNDED_RECTANGLE if el.radius else MSO_SHAPE.RECTANGLE
        sh = shapes.add_shape(kind, e(el.x), e(el.y), e(el.w), e(el.h))
        if k == "rect" and el.radius:
            sh.adjustments[0] = min(0.5, el.radius / min(el.w, el.h))
        _fill(sh, el)
        if el.rot:
            sh.rotation = el.rot % 360
        sh.shadow.inherit = False
    elif k == "line":
        (x1, y1), (x2, y2) = el.pts
        sh = shapes.add_connector(MSO_CONNECTOR.STRAIGHT, e(x1), e(y1), e(x2), e(y2))
        sh.line.color.rgb = rgb(el.stroke)
        sh.line.width = e(el.sw)
        if el.arrow:
            ln = sh.line._get_or_add_ln()
            tail = etree.SubElement(ln, qn("a:tailEnd"))
            tail.set("type", "triangle"), tail.set("w", "med"), tail.set("len", "med")
    elif k == "poly":
        fb = shapes.build_freeform(e(el.pts[0][0]), e(el.pts[0][1]), scale=1.0)
        fb.add_line_segments([(e(x), e(y)) for x, y in el.pts[1:]], close=False)
        sh = fb.convert_to_shape()
        sh.fill.background()
        sh.line.color.rgb = rgb(el.stroke)
        sh.line.width = e(el.sw)
        ln = sh.line._get_or_add_ln()
        ln.set("cap", "rnd")
        etree.SubElement(ln, qn("a:round"))
    elif k == "text":
        sh = _text(shapes, el)
    elif k == "icon":
        png = art.icon_png(el.name, el.color, el.sw, int(el.w * 2))
        sh = shapes.add_picture(png, e(el.x), e(el.y), e(el.w), e(el.h))
    elif k == "image":
        sh = shapes.add_picture(el.name, e(el.x), e(el.y), e(el.w), e(el.h))
    elif k == "video":
        sh = shapes.add_movie(el.name, e(el.x), e(el.y), e(el.w), e(el.h), poster_frame_image=el.poster, mime_type="video/mp4")
    else:
        raise ValueError(k)
    _alt(sh, el)
    if el.link:   # a click in the slide show opens the address in the browser
        for t in (sh.shapes if k == "group" else [sh]):
            t.click_action.hyperlink.address = el.link
    return sh


# ── animation timing ────────────────────────────────────────────────────────

class _Ids:
    def __init__(self):
        self.n = 4

    def __call__(self):
        self.n += 1
        return self.n


def _tgt(spid):
    return f'<p:tgtEl><p:spTgt spid="{spid}"/></p:tgtEl>'


def _set_vis(ids, spid, val, delay=0):
    return (f'<p:set><p:cBhvr><p:cTn id="{ids()}" dur="1" fill="hold"><p:stCondLst><p:cond delay="{delay}"/></p:stCondLst></p:cTn>'
            f'{_tgt(spid)}<p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr>'
            f'<p:to><p:strVal val="{val}"/></p:to></p:set>')


def _anim(ids, spid, attr, frm, to, dur):
    v = lambda x: f'<p:fltVal val="{x}"/>' if isinstance(x, (int, float)) else f'<p:strVal val="{x}"/>'
    return (f'<p:anim calcmode="lin" valueType="num"><p:cBhvr additive="base"><p:cTn id="{ids()}" dur="{dur}" fill="hold"/>{_tgt(spid)}'
            f'<p:attrNameLst><p:attrName>{attr}</p:attrName></p:attrNameLst></p:cBhvr><p:tavLst>'
            f'<p:tav tm="0"><p:val>{v(frm)}</p:val></p:tav><p:tav tm="100000"><p:val>{v(to)}</p:val></p:tav></p:tavLst></p:anim>')


def _effect(ids, spid, cls, preset, sub, delay, body, first):
    node = "afterEffect" if first else "withEffect"
    return (f'<p:par><p:cTn id="{ids()}" presetID="{preset}" presetClass="{cls}" presetSubtype="{sub}" fill="hold" nodeType="{node}">'
            f'<p:stCondLst><p:cond delay="{delay}"/></p:stCondLst><p:childTnLst>{body}</p:childTnLst></p:cTn></p:par>')


def _entrance(ids, spid, a, first):
    fade = f'<p:animEffect transition="in" filter="fade"><p:cBhvr><p:cTn id="{{}}" dur="{a.dur}"/>{_tgt(spid)}</p:cBhvr></p:animEffect>'
    if a.effect == "wipe":                      # From Left (subtype 8) or From Top (subtype 1)
        flt, sub = ("up", 1) if a.dir == "top" else ("left", 8)
        body = _set_vis(ids, spid, "visible") + \
            f'<p:animEffect transition="in" filter="wipe({flt})"><p:cBhvr><p:cTn id="{ids()}" dur="{a.dur}"/>{_tgt(spid)}</p:cBhvr></p:animEffect>'
        return _effect(ids, spid, "entr", 22, sub, a.at, body, first)
    if a.effect == "zoom":
        body = (_set_vis(ids, spid, "visible") + _anim(ids, spid, "ppt_w", 0, "#ppt_w", a.dur)
                + _anim(ids, spid, "ppt_h", 0, "#ppt_h", a.dur) + fade.format(ids()))
        return _effect(ids, spid, "entr", 53, 16, a.at, body, first)
    if a.effect in ("rise", "drop"):
        off = "#ppt_y+0.03" if a.effect == "rise" else "#ppt_y-0.12"
        body = _set_vis(ids, spid, "visible") + _anim(ids, spid, "ppt_y", off, "#ppt_y", a.dur) + fade.format(ids())
        return _effect(ids, spid, "entr", 42 if a.effect == "rise" else 47, 0, a.at, body, first)
    body = _set_vis(ids, spid, "visible") + fade.format(ids())
    return _effect(ids, spid, "entr", 10, 0, a.at, body, first)


def timing_xml(animated, videos=()):
    """Timing that starts by itself when the slide opens: every effect at its own delay.

    videos: [(shape id, start ms, length ms)] — each starts playing at its time.
    """
    ids = _Ids()
    pars = []
    for spid, a in sorted(animated, key=lambda t: t[1].at):
        pars.append(_entrance(ids, spid, a, not pars))
    for spid, at, ms in videos:
        pars.append(_effect(ids, spid, "mediacall", 1, 0, at,
                            f'<p:cmd type="call" cmd="playFrom(0.0)"><p:cBhvr><p:cTn id="{ids()}" dur="{ms}" fill="hold"/>{_tgt(spid)}</p:cBhvr></p:cmd>',
                            not pars))
    media = "".join(f'<p:video><p:cMediaNode vol="80000"><p:cTn id="{ids()}" fill="hold" display="0"><p:stCondLst><p:cond delay="indefinite"/>'
                    f'</p:stCondLst></p:cTn>{_tgt(spid)}</p:cMediaNode></p:video>' for spid, _a, _m in videos)
    return (f'<p:timing xmlns:p="{P_NS}"><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst>'
            f'<p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst>'
            f'<p:par><p:cTn id="3" fill="hold"><p:stCondLst><p:cond delay="indefinite"/><p:cond evt="onBegin" delay="0"><p:tn val="2"/></p:cond>'
            f'</p:stCondLst><p:childTnLst><p:par><p:cTn id="4" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>'
            f'{"".join(pars)}</p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn>'
            f'<p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst>'
            f'<p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst></p:seq>'
            f'{media}</p:childTnLst></p:cTn></p:par></p:tnLst></p:timing>')


def _finish(slide, timing, advance_ms):
    root = slide._element
    for t in root.findall(qn("p:timing")):
        root.remove(t)
    if advance_ms is None:                      # the last slide waits for the presenter
        trans = etree.fromstring(f'<p:transition xmlns:p="{P_NS}" spd="med"><p:fade/></p:transition>')
        clr = root.find(qn("p:clrMapOvr"))
        i = list(root).index(clr) + 1
        root.insert(i, trans)
        if timing:
            root.insert(i + 1, etree.fromstring(timing))
        return
    trans = etree.fromstring(f'<p:transition xmlns:p="{P_NS}" spd="med" advTm="{int(advance_ms)}"><p:fade/></p:transition>')
    clr = root.find(qn("p:clrMapOvr"))
    i = list(root).index(clr) + 1
    root.insert(i, trans)
    if timing:
        root.insert(i + 1, etree.fromstring(timing))


# ── demo recordings (taken from the earlier laptop file) ───────────────────

# slide id -> recordings from the earlier laptop PPTX, played one after the other, and its poster
DEMOS = {"demo-1": (["media5.mp4", "media9.mp4"], "image8.png"), "demo-2": (["media13.mp4"], "image16.png")}


def _seconds(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
                         capture_output=True, text=True).stdout
    return float(out)


def demo_media(source_pptx, workdir):
    """{slide id: (mp4, poster, seconds)}; two recordings for one slide are joined into one video."""
    out = {}
    with zipfile.ZipFile(source_pptx) as z:
        for sid, (mp4s, png) in DEMOS.items():
            for f in mp4s + [png]:
                (workdir / f).write_bytes(z.read(f"ppt/media/{f}"))
            if len(mp4s) == 1:
                video = workdir / mp4s[0]
            else:
                video = workdir / f"{sid}.mp4"
                inputs = sum((["-i", str(workdir / f)] for f in mp4s), [])
                filt = "".join(f"[{k}:v]scale=1920:1080,setsar=1,fps=25[v{k}];" for k in range(len(mp4s)))
                filt += "".join(f"[v{k}]" for k in range(len(mp4s))) + f"concat=n={len(mp4s)}:v=1:a=0[out]"
                subprocess.run(["ffmpeg", "-y", "-loglevel", "error", *inputs, "-filter_complex", filt, "-map", "[out]",
                                "-c:v", "libx264", "-crf", "23", "-pix_fmt", "yuv420p", "-an", str(video)], check=True)
            out[sid] = (video, workdir / png, _seconds(video))
    return out


def _nav(slide):
    """Back and next arrow buttons at the bottom right: [(ring, arrow)] — both carry the link."""
    buttons = []
    for k, (name, label) in enumerate([("arrow-left", "Previous slide"), ("arrow-right", "Next slide")]):
        x = 1700 + k * 96
        ring = slide.shapes.add_shape(MSO_SHAPE.OVAL, e(x), e(992), e(72), e(72))
        _fill(ring, El("ellipse", fill="111a2e", stroke=col("line"), sw=2))
        ring.shadow.inherit = False
        pic = slide.shapes.add_picture(art.icon_png(name, "ink", 2.5, 96), e(x + 18), e(1010), e(36), e(36))
        for sh in (ring, pic):
            sh.name = label
            sh._element.xpath("./*[1]/p:cNvPr")[0].set("descr", label)
        buttons.append((ring, pic))
    return buttons


def build(out_path, demo_source):
    art.qr_png()
    prs = Presentation()
    prs.slide_width, prs.slide_height = e(W), e(H)
    blank = prs.slide_layouts[6]
    work = Path(tempfile.mkdtemp())
    videos = demo_media(demo_source, work)
    made = []
    show = slides(videos)
    for n, (s, els) in enumerate(show):
        sl = prs.slides.add_slide(blank)
        bg = sl.shapes.add_picture(art.background(arcs=s["kind"] in ("title", "intro")), 0, 0, e(W), e(H))
        bg.name = "Background"
        animated, playing = [], []
        for el in els:
            sh = draw(sl.shapes, el)
            if el.anim:
                animated.append((sh.shape_id, el.anim))
            if el.kind == "video":
                playing.append((sh.shape_id, el.anim.at if el.anim else 0, int(videos[s["id"]][2] * 1000)))
        nav = _nav(sl)
        sl.notes_slide.notes_text_frame.text = f"{s['notes']}\n\n{CONTROLS}"
        speak = s["minutes"] * 60000
        if playing:                              # a demo slide stays up until its recording has played
            speak = max(speak, playing[0][1] + playing[0][2] + 3000)
        _finish(sl, timing_xml(animated, playing), speak if n < len(show) - 1 else None)
        made.append((sl, nav))
    for n, (sl, (back, nxt)) in enumerate(made):
        for sh in back if n > 0 else ():
            sh.click_action.target_slide = made[n - 1][0]
        for sh in nxt if n < len(made) - 1 else ():
            sh.click_action.target_slide = made[n + 1][0]
    prs.core_properties.title = DECK["title"]
    prs.core_properties.author = DECK["speaker"]
    prs.save(out_path)
    return len(prs.slides)
