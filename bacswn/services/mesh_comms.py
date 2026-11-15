"""BACSWN — mesh communications: four channels per station, weather damage, failover.

Implements the Master Architecture Plan's transport model (§5.1, §5.4) for the
simulation:

* **Equipment per station.** Every station has VHF radio and an Iridium
  satellite terminal. Cellular is available except at Chub Cay, Ragged Island,
  Mayaguana and Inagua (§5.3). A wired (fibre / copper) line to the BACSWN hub
  exists at the main airport sites only; island coverage is still to be
  confirmed with the telecoms operator.
* **Channels per link.** A link carries every channel both ends can use for that
  distance: VHF within ~60 nm, cellular within ~108 nm, satellite within ~150 nm,
  and wired only on a station's line to the hub (the telco network carries it to
  Nassau whatever the distance).
* **Choice and failover.** A link uses its fastest healthy channel (wired, VHF,
  cellular, then satellite). When that channel fails it switches at once to the
  next healthy one; it switches back only after the better channel has been
  healthy for HYSTERESIS_TICKS in a row, so a flickering link doesn't flap.
* **Weather damage.** Squall-force gusts can bring down a VHF mast, take a
  cellular tower off the air or cut power at the telephone exchange; thunderstorm
  lightning causes short outages of terrestrial equipment. The satellite terminal
  is the survivable element (§7.2) and is not damaged by weather. Damaged
  equipment is repaired after a realistic delay.
"""

from __future__ import annotations

import math

CHANNELS = ("wired", "vhf", "cellular", "satellite")          # fastest first
LABELS = {"wired": "wired line", "vhf": "VHF", "cellular": "cellular", "satellite": "satellite"}
TITLES = {"wired": "Wired line", "vhf": "VHF radio", "cellular": "Cellular", "satellite": "Satellite"}
BASE_LATENCY_MS = {"wired": 4, "vhf": 8, "cellular": 35, "satellite": 600}
VHF_RANGE_DEG = 1.0          # ~60 nm
CELL_RANGE_DEG = 1.8         # ~108 nm
NO_CELLULAR = frozenset({"MYBC", "MYRD", "MYMM", "MYIG"})            # Master Plan §5.3
WIRED = frozenset({"MYNN", "MYGF", "MYAM", "MYEG", "MYEM", "MYLD"})  # main airport sites (to be confirmed)
HYSTERESIS_TICKS = 6         # 30 simulated minutes of stable signal before switching back

# Weather damage: (gust threshold kt, chance per tick, repair ticks (min, max), cause)
SQUALL_DAMAGE = {
    "vhf": (50, 0.25, (36, 72), "Squall gusts of {gust:.0f} kt brought down the VHF mast"),
    "cellular": (45, 0.30, (12, 24), "Cellular tower off the air in {gust:.0f} kt gusts"),
    "wired": (50, 0.15, (24, 48), "Power cut at the telephone exchange in {gust:.0f} kt gusts"),
}
LIGHTNING_DBZ = 45
LIGHTNING_CHANCE = 0.03
LIGHTNING_REPAIR = (2, 4)


def station_channels(code: str) -> list[str]:
    out = ["vhf", "satellite"]
    if code not in NO_CELLULAR:
        out.append("cellular")
    if code in WIRED:
        out.append("wired")
    return [c for c in CHANNELS if c in out]


def new_equipment(code: str) -> dict:
    return {ch: {"up": True, "cause": None, "until": None, "since": None} for ch in station_channels(code)}


def link_channels(a: str, b: str, d_deg: float, hub: str, radio_range_deg: float) -> list[str]:
    """Channels a hop between stations a and b can use, fastest first."""
    sa, sb = set(station_channels(a)), set(station_channels(b))
    out = []
    if hub in (a, b) and "wired" in sa and "wired" in sb:
        out.append("wired")
    if d_deg < VHF_RANGE_DEG:
        out.append("vhf")
    if d_deg < CELL_RANGE_DEG and "cellular" in sa and "cellular" in sb:
        out.append("cellular")
    if d_deg <= radio_range_deg:
        out.append("satellite")
    return out


def latency_ms(channel: str, d_deg: float) -> int:
    return int(BASE_LATENCY_MS[channel] + d_deg * 12)


def channel_ok(sim, link: dict, ch: str) -> bool:
    # "impaired": channel-health monitoring (services/mesh_health.py) sees the channel down although the
    # equipment works (VHF interference, no second cellular carrier).
    return (all(sim.nodes[s]["alive"] and sim.nodes[s]["comms"].get(ch, {}).get("up") for s in (link["a"], link["b"]))
            and not link.get("impaired", {}).get(ch))


def _why_down(sim, link: dict, ch: str) -> str:
    for s in (link["a"], link["b"]):
        n = sim.nodes[s]
        if not n["alive"]:
            return f"{s} offline"
        eq = n["comms"].get(ch)
        if eq and not eq["up"]:
            return f"{s}: {eq['cause']}"
    return "unavailable"


def set_active(sim, link: dict, ch: str | None) -> None:
    link["active"] = ch
    link["type"] = ch or link["channels"][0]
    if ch:
        link["latency_ms"] = latency_ms(ch, link["distance_nm"] / 60)


def init_link(sim, link: dict) -> None:
    link["better_since"] = None
    set_active(sim, link, link["channels"][0])


def damage(sim, station: str, channel: str, cause: str, repair_ticks: int | None) -> bool:
    """Take a station's equipment for `channel` out of service. Returns False if it has none / already down."""
    eq = sim.nodes[station]["comms"].get(channel)
    if not eq or not eq["up"]:
        return False
    eq.update(up=False, cause=cause, since=sim.tick,
              until=None if repair_ticks is None else sim.tick + repair_ticks)
    sim._event(station, "COMMS_DOWN", f"{TITLES[channel]} out of service: {cause}")
    return True


def repair(sim, station: str, channel: str, how: str = "repaired") -> bool:
    eq = sim.nodes[station]["comms"].get(channel)
    if not eq or eq["up"]:
        return False
    eq.update(up=True, cause=None, until=None, since=None)
    sim._event(station, "COMMS_UP", f"{TITLES[channel]} back in service ({how})")
    return True


def _weather(sim, rng) -> None:
    for code, n in sim.nodes.items():
        if not n["alive"]:
            continue
        f = sim._field(n["lat"], n["lon"])
        gust = f["gust"]
        for ch, (threshold, chance, (lo, hi), cause) in SQUALL_DAMAGE.items():
            if gust >= threshold and ch in n["comms"] and n["comms"][ch]["up"] and rng.random() < chance:
                damage(sim, code, ch, cause.format(gust=gust), rng.randint(lo, hi))
        if f["dbz"] >= LIGHTNING_DBZ and rng.random() < LIGHTNING_CHANCE:
            targets = [ch for ch in ("vhf", "cellular", "wired") if ch in n["comms"] and n["comms"][ch]["up"]]
            if targets:
                damage(sim, code, rng.choice(targets), "Lightning strike nearby; surge protection tripped",
                       rng.randint(*LIGHTNING_REPAIR))


def _repairs(sim) -> None:
    for code, n in sim.nodes.items():
        for ch, eq in n["comms"].items():
            if not eq["up"] and eq["until"] is not None and sim.tick >= eq["until"]:
                repair(sim, code, ch, f"after {(sim.tick - eq['since']) * sim_minutes(sim)} min")


def sim_minutes(sim) -> int:
    from services.mesh_network import SIM_MINUTES_PER_TICK
    return SIM_MINUTES_PER_TICK


def _culprit(sim, link: dict, ch: str | None) -> str:
    """The end of the link whose equipment (or station) failed, for the event log."""
    if ch:
        for s in (link["a"], link["b"]):
            n = sim.nodes[s]
            if not n["alive"] or not n["comms"].get(ch, {}).get("up", True):
                return s
    return link["a"]


def _select(sim) -> None:
    for link in sim.links.values():
        healthy = [ch for ch in link["channels"] if channel_ok(sim, link, ch)]
        cur = link["active"]
        name = f"{link['a']}–{link['b']}"
        if cur not in healthy:
            new = healthy[0] if healthy else None
            if new != cur:
                if new:
                    sim._event(_culprit(sim, link, cur), "FAILOVER", f"{name}: {LABELS[cur] if cur else 'link'} lost "
                               f"({_why_down(sim, link, cur) if cur else 'down'}), switched to {LABELS[new]}")
                elif cur:
                    sim._event(_culprit(sim, link, cur), "LINK_LOST", f"{name}: no working channel ({_why_down(sim, link, cur)})")
                set_active(sim, link, new)
            link["better_since"] = None
            continue
        better = healthy[0] if healthy else None
        if better and better != cur and CHANNELS.index(better) < CHANNELS.index(cur):
            if link["better_since"] is None:
                link["better_since"] = sim.tick
            elif sim.tick - link["better_since"] >= HYSTERESIS_TICKS:
                sim._event(link["a"], "FAILBACK", f"{name}: {LABELS[better]} stable for "
                           f"{HYSTERESIS_TICKS * sim_minutes(sim)} min, switched back from {LABELS[cur]}")
                set_active(sim, link, better)
                link["better_since"] = None
        else:
            link["better_since"] = None


def update(sim, rng) -> None:
    """One tick: weather damage, repairs, then each link's channel choice."""
    _weather(sim, rng)
    _repairs(sim)
    _select(sim)


def link_view(sim, link: dict) -> dict:
    chans = []
    for ch in link["channels"]:
        ok = channel_ok(sim, link, ch)
        chans.append({"type": ch, "ok": ok, "why": None if ok else _why_down(sim, link, ch)})
    pending = None
    if link["better_since"] is not None:
        better = next(c["type"] for c in chans if c["ok"])
        left = max(0, HYSTERESIS_TICKS - (sim.tick - link["better_since"]))
        pending = {"channel": better, "minutes_left": left * sim_minutes(sim)}
    return {"active": link["active"], "preferred": link["channels"][0], "channels": chans,
            "on_backup": link["active"] is not None and link["active"] != link["channels"][0],
            "switch_back": pending}


def station_view(n: dict) -> list[dict]:
    return [{"type": ch, "up": eq["up"], "cause": eq["cause"]} for ch, eq in n["comms"].items()]
