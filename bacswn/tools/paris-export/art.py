"""Bitmaps both renderers share: Lucide icons in any colour, the slide backgrounds, the QR code."""
import json
import math
from functools import lru_cache
from pathlib import Path

import cairosvg
import numpy as np
from PIL import Image, ImageDraw

from scenes import ASSETS, C, H, W, col

CACHE = ASSETS / "cache"
ICONS = json.loads((ASSETS / "lucide-icons.json").read_text())


@lru_cache(maxsize=None)
def icon_png(name, color, sw, px):
    """A Lucide icon drawn as a transparent PNG, `px` pixels square; returns its path."""
    CACHE.mkdir(parents=True, exist_ok=True)
    out = CACHE / f"icon-{name}-{color}-{sw}-{px}.png"
    if not out.exists():
        parts = "".join(f"<{t} " + " ".join(f'{k}="{v}"' for k, v in a.items()) + "/>" for t, a in ICONS[name])
        svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="{px}" height="{px}" fill="none" '
               f'stroke="#{col(color)}" stroke-width="{sw}" stroke-linecap="round" stroke-linejoin="round">{parts}</svg>')
        cairosvg.svg2png(bytestring=svg.encode(), write_to=str(out), output_width=px, output_height=px)
    return str(out)


def qr_png():
    out = ASSETS / "qr-live.png"
    if not out.exists():
        cairosvg.svg2png(url=str(ASSETS / "qr-live.svg"), write_to=str(out), output_width=800, output_height=800)
    return str(out)


def _hex(h):
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], dtype=float)


def background(arcs=False):
    """The web deck's stage: a soft radial glow top right on deep navy; the title adds flight arcs."""
    CACHE.mkdir(parents=True, exist_ok=True)
    out = CACHE / ("bg-title.png" if arcs else "bg.png")
    if out.exists():
        return str(out)
    yy, xx = np.mgrid[0:H, 0:W]
    d = np.sqrt(((xx - 0.72 * W) / 1400) ** 2 + ((yy - 0.18 * H) / 820) ** 2)
    t = np.clip(d / 0.62, 0, 1)[..., None]
    img = (_hex("0f2747") * (1 - t) + _hex(C["bg"]) * t).astype(np.uint8)
    im = Image.fromarray(img, "RGB")
    if arcs:
        layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        dr = ImageDraw.Draw(layer)
        tones = [C["accent"], C["gold"], C["ok"]]
        for i in range(9):
            p0, p1, p2 = (-120 + i * 48, 980 - i * 70), (960, -240 + i * 84), (2040 - i * 36, 360 + i * 66)
            tone = tones[2] if i % 3 == 2 else tones[1] if i % 2 == 1 else tones[0]
            rgba = tuple(int(tone[k:k + 2], 16) for k in (0, 2, 4)) + (115,)
            pts = [((1 - u) ** 2 * p0[0] + 2 * (1 - u) * u * p1[0] + u ** 2 * p2[0],
                    (1 - u) ** 2 * p0[1] + 2 * (1 - u) * u * p1[1] + u ** 2 * p2[1]) for u in np.linspace(0, 1, 600)]
            run, on = 0.0, True
            for a, b in zip(pts, pts[1:]):
                seg = math.dist(a, b)
                if on:
                    dr.line([a, b], fill=rgba, width=2)
                run += seg
                if run >= (8 if on else 12):
                    run, on = 0.0, not on
        im = Image.alpha_composite(im.convert("RGBA"), layer).convert("RGB")
    im.save(out, optimize=True)
    return str(out)
