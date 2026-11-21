"""BACSWN — Coastal carbon permanence replay.

Replays a real hurricane over an illustrative portfolio of coastal (blue-carbon)
credit projects, hour by hour, and measures how much of each project, and of the
portfolio's credits, sat under damaging winds. Supports the argument that
reversal risk for coastal credits is largely storm risk, and that storm risk is
observable rather than something to cover with a static buffer.

Track: NOAA NHC HURDAT2 best track for Hurricane Dorian (AL052019), file
hurdat2-1851-2025-092326.txt (https://www.nhc.noaa.gov/data/hurdat/), rows
2019-08-30 18Z to 2019-09-04 12Z copied verbatim. Each row: time (UTC), record
id ("L" = landfall), lat, lon, max sustained wind (kt), min pressure (mb), and
the 34/50/64-kt wind radii (nmi) in the NE, SE, SW, NW quadrants.

Method (stated on screen):
  - positions, winds and radii are interpolated linearly to every hour;
  - a point is under >= 34 / 50 / 64 kt winds when it lies inside that radius
    for the quadrant it is in (the best track's own wind-field description);
  - a project's exposure is the share of its area (sampled on a grid) inside
    each radius; credits are assumed spread evenly over a project's area.
The project areas are illustrative outlines, not real carbon projects.
"""

import math
from datetime import datetime, timedelta, timezone
from functools import lru_cache

SOURCE = {
    "storm": "Hurricane Dorian (AL052019)",
    "dataset": "NOAA NHC HURDAT2 Atlantic best track",
    "file": "hurdat2-1851-2025-092326.txt",
    "url": "https://www.nhc.noaa.gov/data/hurdat/",
}

# time, record id, lat, lon, vmax kt, pmin mb, r34 (NE,SE,SW,NW), r50, r64
DORIAN = [
    ("2019-08-30T18:00Z", "", 24.8, -70.3, 100, 968, (90, 80, 60, 80), (50, 50, 40, 40), (25, 25, 15, 20)),
    ("2019-08-31T00:00Z", "", 25.3, -71.1, 115, 949, (90, 90, 60, 80), (50, 50, 40, 40), (25, 25, 15, 20)),
    ("2019-08-31T06:00Z", "", 25.6, -72.1, 120, 947, (90, 90, 60, 80), (50, 50, 40, 40), (25, 25, 15, 20)),
    ("2019-08-31T12:00Z", "", 25.9, -73.0, 125, 944, (100, 100, 60, 90), (50, 50, 40, 50), (25, 25, 15, 25)),
    ("2019-08-31T18:00Z", "", 26.1, -74.0, 130, 942, (100, 100, 60, 90), (50, 50, 40, 50), (25, 25, 20, 25)),
    ("2019-09-01T00:00Z", "", 26.3, -74.7, 135, 939, (110, 110, 60, 90), (50, 50, 40, 50), (30, 25, 20, 25)),
    ("2019-09-01T06:00Z", "", 26.4, -75.6, 145, 934, (110, 110, 70, 90), (50, 50, 40, 50), (30, 25, 20, 25)),
    ("2019-09-01T12:00Z", "", 26.5, -76.5, 155, 927, (110, 110, 70, 90), (60, 50, 50, 50), (35, 30, 25, 25)),
    ("2019-09-01T16:40Z", "L", 26.5, -77.0, 160, 910, (110, 110, 70, 90), (60, 50, 50, 50), (35, 30, 25, 25)),
    ("2019-09-01T18:00Z", "", 26.5, -77.1, 160, 910, (120, 120, 70, 90), (60, 50, 50, 50), (35, 30, 25, 25)),
    ("2019-09-02T00:00Z", "", 26.6, -77.7, 155, 914, (120, 120, 80, 100), (70, 60, 50, 50), (40, 30, 25, 25)),
    ("2019-09-02T02:15Z", "L", 26.6, -77.8, 155, 914, (120, 120, 80, 100), (70, 60, 50, 50), (40, 30, 25, 25)),
    ("2019-09-02T06:00Z", "", 26.6, -78.0, 145, 916, (130, 120, 80, 100), (70, 60, 50, 50), (40, 30, 25, 25)),
    ("2019-09-02T12:00Z", "", 26.7, -78.3, 135, 927, (130, 120, 80, 100), (80, 70, 50, 50), (40, 30, 25, 25)),
    ("2019-09-02T18:00Z", "", 26.8, -78.4, 125, 938, (140, 130, 90, 100), (80, 70, 50, 50), (40, 30, 25, 30)),
    ("2019-09-03T00:00Z", "", 26.9, -78.5, 115, 944, (140, 130, 90, 110), (80, 70, 50, 60), (40, 30, 25, 40)),
    ("2019-09-03T06:00Z", "", 27.0, -78.5, 105, 950, (140, 130, 90, 120), (90, 80, 60, 60), (45, 35, 25, 40)),
    ("2019-09-03T12:00Z", "", 27.1, -78.5, 100, 954, (150, 130, 90, 130), (90, 80, 60, 70), (45, 35, 25, 40)),
    ("2019-09-03T18:00Z", "", 27.6, -78.6, 95, 959, (150, 130, 100, 130), (90, 80, 60, 80), (50, 40, 30, 45)),
    ("2019-09-04T00:00Z", "", 28.1, -78.8, 90, 959, (150, 130, 100, 140), (100, 80, 60, 90), (50, 40, 30, 50)),
    ("2019-09-04T06:00Z", "", 28.8, -79.2, 90, 964, (150, 130, 100, 140), (100, 80, 60, 90), (50, 40, 30, 50)),
    ("2019-09-04T12:00Z", "", 29.5, -79.6, 90, 963, (150, 130, 100, 140), (100, 80, 60, 90), (50, 40, 40, 50)),
]

BANDS = (34, 50, 64)
QUADRANTS = ("NE", "SE", "SW", "NW")
LOCAL_OFFSET_H = -4          # Bahamas, Eastern Daylight Time in September

# Illustrative coastal credit projects: outline [lat, lon] and the kind of
# blue-carbon activity. Not real projects; outlines are approximate.
PROJECTS = [
    {"id": "abaco-marls", "name": "Abaco, west-side mangroves", "kind": "Mangrove restoration",
     "outline": [[26.62, -77.36], [26.62, -77.24], [26.50, -77.20], [26.42, -77.26], [26.46, -77.36]]},
    {"id": "gb-north", "name": "East Grand Bahama, north-shore mangroves", "kind": "Mangrove conservation",
     "outline": [[26.73, -78.42], [26.73, -78.10], [26.67, -78.06], [26.66, -78.40]]},
    {"id": "lbb-seagrass", "name": "Little Bahama Bank seagrass", "kind": "Seagrass conservation",
     "outline": [[26.98, -78.45], [26.98, -78.12], [26.84, -78.12], [26.84, -78.45]]},
    {"id": "andros-north", "name": "North Andros mangroves", "kind": "Mangrove conservation",
     "outline": [[25.07, -78.28], [25.07, -78.12], [24.86, -78.12], [24.86, -78.28]]},
]

NM_PER_DEG = 60.0
KM_PER_DEG = 111.32


def category(vmax_kt: float) -> int:
    """Saffir-Simpson category from 1-minute sustained wind in knots (0 = below hurricane)."""
    for cat, lo in ((5, 137), (4, 113), (3, 96), (2, 83), (1, 64)):
        if vmax_kt >= lo:
            return cat
    return 0


def _parse(t: str) -> datetime:
    return datetime.strptime(t, "%Y-%m-%dT%H:%MZ").replace(tzinfo=timezone.utc)


def _distance_bearing(lat1, lon1, lat2, lon2):
    """Great-circle distance (nmi) and initial bearing (deg) from point 1 to point 2."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dl = math.radians(lon2 - lon1)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    d = 2 * math.asin(min(1.0, math.sqrt(a))) * 180 / math.pi * NM_PER_DEG
    y = math.sin(dl) * math.cos(p2)
    x = math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(dl)
    return d, (math.degrees(math.atan2(y, x)) + 360) % 360


def _destination(lat, lon, bearing, dist_nm):
    """Point reached from (lat, lon) along `bearing` for `dist_nm` (small-distance approximation)."""
    b = math.radians(bearing)
    dlat = dist_nm * math.cos(b) / NM_PER_DEG
    dlon = dist_nm * math.sin(b) / (NM_PER_DEG * math.cos(math.radians(lat)))
    return [round(lat + dlat, 4), round(lon + dlon, 4)]


def wind_band(fix: dict, lat: float, lon: float) -> int:
    """Highest wind threshold (0, 34, 50 or 64 kt) reaching the point at this fix."""
    d, brg = _distance_bearing(fix["lat"], fix["lon"], lat, lon)
    q = int(brg // 90) % 4
    for band in reversed(BANDS):
        if d <= fix["radii"][band][q]:
            return band
    return 0


def wind_field(fix: dict) -> dict:
    """Outline of each wind radius (quadrant arcs) for drawing on a map."""
    out = {}
    for band in BANDS:
        r = fix["radii"][band]
        if not any(r):
            out[band] = []
            continue
        pts = []
        for q in range(4):
            for k in range(7):
                pts.append(_destination(fix["lat"], fix["lon"], q * 90 + k * 15, r[q]))
        pts.append(pts[0])
        out[band] = pts
    return out


def hourly_track() -> list[dict]:
    """The best track interpolated to every whole hour (UTC)."""
    fixes = [{"t": _parse(r[0]), "lat": r[2], "lon": r[3], "vmax": r[4], "pmin": r[5],
              "radii": {34: r[6], 50: r[7], 64: r[8]}, "landfall": r[1] == "L"} for r in DORIAN]
    out = []
    t = fixes[0]["t"]
    i = 0
    while t <= fixes[-1]["t"]:
        while fixes[i + 1]["t"] < t:
            i += 1
        a, b = fixes[i], fixes[i + 1]
        f = (t - a["t"]).total_seconds() / (b["t"] - a["t"]).total_seconds()
        lerp = lambda x, y: x + (y - x) * f  # noqa: E731
        out.append({
            "t": t, "lat": round(lerp(a["lat"], b["lat"]), 3), "lon": round(lerp(a["lon"], b["lon"]), 3),
            "vmax": round(lerp(a["vmax"], b["vmax"])), "pmin": round(lerp(a["pmin"], b["pmin"])),
            "radii": {band: tuple(round(lerp(x, y)) for x, y in zip(a["radii"][band], b["radii"][band]))
                      for band in BANDS},
        })
        t += timedelta(hours=1)
    return out


def _inside(lat, lon, poly) -> bool:
    inside = False
    for (y1, x1), (y2, x2) in zip(poly, poly[1:] + poly[:1]):
        if (y1 > lat) != (y2 > lat) and lon < (x2 - x1) * (lat - y1) / (y2 - y1) + x1:
            inside = not inside
    return inside


def _samples(poly, step=0.01) -> list[tuple[float, float]]:
    lats = [p[0] for p in poly]
    lons = [p[1] for p in poly]
    pts = []
    la = min(lats) + step / 2
    while la < max(lats):
        lo = min(lons) + step / 2
        while lo < max(lons):
            if _inside(la, lo, poly):
                pts.append((la, lo))
            lo += step
        la += step
    return pts


def area_ha(poly) -> float:
    """Approximate polygon area in hectares (local equirectangular projection)."""
    lat0 = math.radians(sum(p[0] for p in poly) / len(poly))
    xy = [(p[1] * KM_PER_DEG * math.cos(lat0), p[0] * KM_PER_DEG) for p in poly]
    s = sum(x1 * y2 - x2 * y1 for (x1, y1), (x2, y2) in zip(xy, xy[1:] + xy[:1]))
    return abs(s) / 2 * 100


def _local(t: datetime) -> str:
    return (t + timedelta(hours=LOCAL_OFFSET_H)).strftime("%a %d %b %H:%M")


@lru_cache(maxsize=1)
def replay() -> dict:
    """The full replay: hourly storm state, each project's exposure, and portfolio totals."""
    track = hourly_track()
    projects = []
    for p in PROJECTS:
        ha = area_ha(p["outline"])
        projects.append({**p, "area_ha": round(ha), "_pts": _samples(p["outline"])})
    total_ha = sum(p["area_ha"] for p in projects)
    for p in projects:
        p["portfolio_share_pct"] = round(100 * p["area_ha"] / total_ha, 1)

    cum = {p["id"]: {"h64": 0, "h34": 0, "peak64": 0.0, "peak_band": 0, "peak_cat": 0} for p in projects}
    port_peak64 = 0.0
    port_h64 = 0
    steps = []
    for fix in track:
        cat = category(fix["vmax"])
        exp = {}
        port64 = 0.0
        for p in projects:
            bands = [wind_band(fix, la, lo) for la, lo in p["_pts"]]
            n = len(bands) or 1
            share = {band: round(100 * sum(b >= band for b in bands) / n, 1) for band in BANDS}
            c = cum[p["id"]]
            if share[64] >= 50:
                c["h64"] += 1
            if share[34] >= 50:
                c["h34"] += 1
            if share[64] > c["peak64"]:
                c["peak64"] = share[64]
            top = max(bands) if bands else 0
            c["peak_band"] = max(c["peak_band"], top)
            if top >= 64:
                c["peak_cat"] = max(c["peak_cat"], cat)
            exp[p["id"]] = {"share": share, "band": top, "hours_hurricane": c["h64"], "hours_storm": c["h34"]}
            port64 += share[64] * p["portfolio_share_pct"] / 100
        port64 = round(port64, 1)
        port_peak64 = max(port_peak64, port64)
        if port64 > 0:
            port_h64 += 1
        steps.append({
            "utc": fix["t"].strftime("%Y-%m-%dT%H:%MZ"), "local": _local(fix["t"]),
            "lat": fix["lat"], "lon": fix["lon"], "vmax_kt": fix["vmax"], "pmin_mb": fix["pmin"],
            "category": cat, "field": wind_field(fix), "exposure": exp,
            "portfolio_pct_hurricane": port64, "portfolio_hours_hurricane": port_h64,
        })

    summary = [{"id": p["id"], "name": p["name"], "kind": p["kind"], "area_ha": p["area_ha"],
                "portfolio_share_pct": p["portfolio_share_pct"],
                "hours_hurricane": cum[p["id"]]["h64"], "hours_storm": cum[p["id"]]["h34"],
                "peak_pct_hurricane": cum[p["id"]]["peak64"], "peak_band_kt": cum[p["id"]]["peak_band"],
                "peak_category": cum[p["id"]]["peak_cat"]} for p in projects]
    return {
        "source": SOURCE,
        "method": [
            "Six-hourly NOAA best-track positions, winds and wind radii, interpolated to each hour.",
            "A place is under hurricane-force winds (64 kt or more) when it lies inside the best track's 64-kt radius for its quadrant; likewise 34 kt for gale-force.",
            "A project counts an hour of hurricane-force exposure when at least half its area is inside the 64-kt radius.",
            "Credits are assumed to be spread evenly over each project's area, so the share of area exposed is the share of credits exposed.",
            "Project outlines are illustrative, not real carbon projects. Wind exposure is not damage: actual loss depends on surge, species and site.",
        ],
        "local_time": "EDT (UTC−4)",
        "projects": [{k: v for k, v in p.items() if k != "_pts"} for p in projects],
        "steps": steps,
        "summary": summary,
        "portfolio": {"peak_pct_hurricane": port_peak64, "hours_any_hurricane": port_h64},
    }
