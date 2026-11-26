"""BACSWN — channel-health monitoring and failure detection (Master Plan v2.1 §5.5).

services/mesh_comms.py simulates what actually happens to each station's radios
(weather damage, repairs, failover). This module simulates what the network can
*observe* and *infer* about it, the way the deployed system would:

* **Radio telemetry** per station and channel, derived from the equipment's true
  condition: VHF signal strength, noise floor, antenna VSWR and supply voltage;
  cellular registration, signal (RSRP), data session and active SIM (dual-SIM
  router, carriers A and B); Iridium signal bars, last short-burst result and
  antenna current; wired line sync.
* **Per-channel heartbeats** on every link, with hysteresis: up → degraded →
  down, and back to up only after a sustained run of good heartbeats. Telemetry
  alarms (VSWR fault, no supply voltage, no antenna current) mark a channel down
  at once.
* **Cross-station classification** at the hub: path problem, station equipment
  fault (with a MAINT ticket naming the component), local network outage (the
  carrier's or telco's problem, no BACSWN ticket), channel-wide outage (several
  stations at once, no tickets) and suspected interference.

Faults the presenter can inject here (all also visible to mesh_comms failover):
VHF antenna damage, loss of VHF repeater power, satellite antenna fault, a
carrier-A outage across the network, and VHF interference around a station.

Thresholds are the Master Plan's reference values scaled to the simulation clock
(one tick = 5 simulated minutes = one heartbeat round).

How: state lives in ``sim._health`` (rebuilt whenever the simulation rebuilds its
links). ``update`` runs once per tick with the simulation's dedicated health
random stream: telemetry → heartbeats → classification → open/resolve diagnoses
(MAINT tickets for persistent equipment faults). It feeds back into
``mesh_comms`` only the impairments that equipment state cannot show.
"""

from __future__ import annotations

from collections import deque

from services import mesh_comms as comms

WINDOW = 12                 # heartbeat results kept per link channel
DEGRADED_MISSES = 2         # consecutive misses → degraded
DOWN_MISSES = 3             # consecutive misses → down
DEGRADED_LOSS = 0.20        # loss over the window → degraded
DOWN_LOSS = 0.60            # loss over the window → down
RECOVER_GOOD = 4            # consecutive good heartbeats to return to up
TICKET_AFTER = 5            # an equipment fault must persist this long (25 sim-min) before a MAINT ticket:
                            # lightning surge trips reset themselves within ~20 min
VSWR_WARN, VSWR_FAULT = 2.0, 3.0
INTERFERENCE_DB = 10        # noise-floor rise that counts as interference
NOISE_FLOOR = -118.0        # dBm, quiet VHF channel
CHANNEL_WIDE_MIN = 3        # stations losing the same channel at once
CARRIER_B_GAPS = frozenset({"MYES", "MYCB", "MYBS"})  # stations with no carrier-B coverage (illustrative)

KINDS = ("vhf_antenna", "radio_power", "sat_antenna", "carrier_outage", "vhf_interference", "comms_restore")

HW_FAULTS = {
    "vhf_antenna": ("vhf", "VHF antenna or feeder damaged"),
    "radio_power": ("vhf", "VHF repeater lost power"),
    "sat_antenna": ("satellite", "Satellite antenna disconnected"),
}


def _state(sim) -> dict:
    """The simulation's health-monitoring state, created on first use and after a reset."""
    st = getattr(sim, "_health", None)
    if st is None or st.get("built_for") is not sim.links:
        st = sim._health = {
            "built_for": sim.links,
            "hw": {},                       # station -> set of HW_FAULTS keys
            "carrier_a_down": False,
            "interference": {},             # station -> extra noise dB at that station's VHF receiver
            "beats": {},                    # (a, b, ch) -> deque of bools
            "state": {},                    # (a, b, ch) -> {"state", "since", "good_run", "miss_run"}
            "diagnoses": {},                # key -> diagnosis dict (open)
            "history": deque(maxlen=30),    # resolved diagnoses
        }
    return st


# ── telemetry ───────────────────────────────────────────────────────────────

def _telemetry(sim, n: dict, st: dict, rng) -> dict:
    """Radio telemetry for one station's channels, derived from true equipment state plus noise."""
    code = n["station"]
    eq = n["comms"]
    hw = st["hw"].get(code, set())
    alive = n["alive"]
    out: dict = {}
    if "vhf" in eq:
        cause = (eq["vhf"]["cause"] or "").lower()
        mast_down = not eq["vhf"]["up"] and ("mast" in cause or "antenna" in cause)
        no_power = "radio_power" in hw or (not eq["vhf"]["up"] and ("surge" in cause or "power" in cause))
        vswr = 3.8 if ("vhf_antenna" in hw or mast_down) else round(1.25 + rng.random() * 0.15, 2)
        noise = NOISE_FLOOR + st["interference"].get(code, 0) + rng.gauss(0, 1.0)
        out["vhf"] = {
            "powered": alive and not no_power,
            "supply_v": 0.0 if (no_power or not alive) else round(13.6 + rng.gauss(0, 0.1), 1),
            "vswr": None if (no_power or not alive) else vswr,
            "noise_dbm": None if (no_power or not alive) else round(noise, 1),
            "rssi_dbm": None if (no_power or not alive or vswr >= VSWR_FAULT) else round(-78 + rng.gauss(0, 3), 1),
            "surge_tripped": "surge" in cause,
        }
    if "cellular" in eq:
        tower = eq["cellular"]["up"]
        sim_b = st["carrier_a_down"]
        registered = alive and tower and not (sim_b and code in CARRIER_B_GAPS)
        out["cellular"] = {
            "registered": registered, "data_session": registered,
            "carrier": "B" if sim_b else "A",
            "rsrp_dbm": round(-95 + rng.gauss(0, 4), 1) if registered else None,
            "modem_ok": alive,
        }
    if "satellite" in eq:
        ant = "sat_antenna" not in hw and eq["satellite"]["up"]
        ok = alive and ant
        out["satellite"] = {
            "antenna_ma": round(85 + rng.gauss(0, 3)) if ok else 0,
            "bars": rng.choice((3, 4, 4, 5)) if ok else 0,
            "last_sbd": "OK" if ok else "FAIL (no signal)",
        }
    if "wired" in eq:
        out["wired"] = {"line_sync": alive and eq["wired"]["up"]}
    return out


def _alarm(tel: dict, ch: str) -> str | None:
    """A telemetry reading that marks the channel down immediately."""
    t = tel.get(ch)
    if not t:
        return None
    if ch == "vhf":
        if not t["powered"]:
            return "no supply voltage"
        if t["vswr"] is not None and t["vswr"] >= VSWR_FAULT:
            return f"VSWR {t['vswr']}:1"
    if ch == "satellite" and t["antenna_ma"] == 0:
        return "no antenna current"
    if ch == "cellular" and not t["registered"]:
        return "not registered on the network"
    if ch == "wired" and not t["line_sync"]:
        return "line out of sync"
    return None


# ── heartbeats ─────────────────────────────────────────────────────────────

def _impairment(st: dict, link: dict, ch: str) -> float:
    """Extra heartbeat loss from interference near either end (VHF only)."""
    if ch != "vhf":
        return 0.0
    extra = max(st["interference"].get(link["a"], 0), st["interference"].get(link["b"], 0))
    return 0.0 if extra < INTERFERENCE_DB else min(0.9, 0.25 + (extra - INTERFERENCE_DB) * 0.05)


def _heartbeats(sim, st: dict, tel: dict, rng) -> None:
    """Exchange one heartbeat per link channel and move each through up/degraded/down.

    A telemetry alarm marks the channel down at once; otherwise missed beats and
    loss over the window degrade it, and it returns to up only after RECOVER_GOOD
    good beats in a row.
    """
    for link in sim.links.values():
        for ch in link["channels"]:
            key = (link["a"], link["b"], ch)
            beats = st["beats"].setdefault(key, deque(maxlen=WINDOW))
            s = st["state"].setdefault(key, {"state": "up", "since": sim.tick, "good_run": WINDOW, "miss_run": 0,
                                              "alarm": None})
            alarm = next((f"{x}: {a}" for x in (link["a"], link["b"])
                          if (a := _alarm(tel.get(x, {}), ch))), None)
            cut = not link["up"]                       # presenter cut the path itself
            works = sim.nodes[link["a"]]["alive"] and sim.nodes[link["b"]]["alive"] and not alarm and not cut
            ok = works and rng.random() >= 0.01 + _impairment(st, link, ch)
            beats.append(ok)
            s["good_run"] = s["good_run"] + 1 if ok else 0
            s["miss_run"] = 0 if ok else s["miss_run"] + 1
            loss = beats.count(False) / len(beats)
            prev = s["state"]
            if alarm or s["miss_run"] >= DOWN_MISSES or (len(beats) >= 6 and loss >= DOWN_LOSS and not ok):
                new = "down"
            elif prev != "up" and s["good_run"] >= RECOVER_GOOD:
                new = "up"                             # back only after a sustained good run (hysteresis)
            elif prev != "up":
                new = prev
            elif s["miss_run"] >= DEGRADED_MISSES or (len(beats) >= 6 and loss >= DEGRADED_LOSS):
                new = "degraded"
            else:
                new = "up"
            if new != prev:
                s["since"] = sim.tick
                if new == "down":
                    # What took it down: failed equipment (mesh_comms already fails over), a presenter
                    # cut, or something only the monitoring can see (interference, no second carrier).
                    equipment = not comms.channel_ok(sim, {**link, "impaired": {}}, ch)
                    s["cause"] = "cut" if cut else "equipment" if equipment else "signal"
                elif new == "up":
                    s["cause"] = None
                    beats.clear()                  # recovered: judge the link afresh from here
            s.update(state=new, alarm=alarm, loss=round(loss, 2))
            # Feed back into failover only what mesh_comms cannot see itself; never hold a repaired
            # channel out while the heartbeats re-confirm it (that would delay the 30-min failback).
            link.setdefault("impaired", {})[ch] = new == "down" and s.get("cause") == "signal"


# ── classification ─────────────────────────────────────────────────────────

def _station_component(code: str, ch: str, t: dict) -> str | None:
    """Name the failed component from the station's own readings (None = readings look normal)."""
    if ch == "vhf":
        if t.get("surge_tripped"):
            return "VHF surge protector tripped (lightning); repeater without power"
        if not t["powered"]:
            return "VHF repeater has no supply voltage"
        if t["vswr"] is not None and t["vswr"] >= VSWR_FAULT:
            return f"VHF antenna or feeder damaged (VSWR {t['vswr']}:1)"
    if ch == "satellite" and t["antenna_ma"] == 0:
        return "Satellite antenna fault (no antenna current)"
    return None


def _classify(sim, st: dict, tel: dict) -> dict[str, dict]:
    """Diagnose current failures across stations, keyed by a stable diagnosis key.

    Classes: equipment (with a ticket naming the component), local network,
    channel-wide outage, interference and path problem.
    """
    found: dict[str, dict] = {}
    by_station_ch: dict[tuple, list] = {}
    for (a, b, ch), s in st["state"].items():
        for code in (a, b):
            by_station_ch.setdefault((code, ch), []).append(s["state"])

    def add(key, cls, title, detail, stations, ticket=None):
        """Record one diagnosis under `key`."""
        found[key] = {"key": key, "class": cls, "title": title, "detail": detail,
                      "stations": sorted(stations), "ticket": ticket}

    # Station equipment, local network and line faults.
    cell_lost, noisy = [], []
    for code, n in sim.nodes.items():
        if not n["alive"]:
            continue
        t = tel.get(code, {})
        for ch in t:
            states = by_station_ch.get((code, ch), [])
            all_down = bool(states) and all(x == "down" for x in states)
            comp = _station_component(code, ch, t[ch])
            if comp and (all_down or not states):
                add(f"hw:{code}:{ch}", "equipment", f"{code}: {comp}",
                    f"Every {comms.LABELS[ch]} link at {code} is down and its own readings show the cause. "
                    "Traffic has failed over; a maintenance ticket names the component.", [code], ticket=comp)
            elif ch == "cellular" and not t[ch]["registered"]:
                cell_lost.append(code)
            elif ch == "wired" and not t[ch]["line_sync"]:
                add(f"line:{code}", "local", f"{code}: wired line down",
                    "The line to the BACSWN hub has lost sync while the station's equipment reads normal: a "
                    "telephone-company fault. Reported to the telco; no BACSWN maintenance ticket.", [code])
        v = t.get("vhf")
        if v and v["noise_dbm"] is not None and v["noise_dbm"] - NOISE_FLOOR >= INTERFERENCE_DB \
                and v["rssi_dbm"] is not None:
            noisy.append(code)

    # Cellular: several stations at once = channel-wide; one or two = local tower.
    if st["carrier_a_down"]:
        switched = sorted(c for c, x in tel.items() if "cellular" in x and x["cellular"]["registered"])
        add("carrier:A", "channel-wide", "Carrier A outage across the network",
            f"{len(switched)} stations' dual-SIM routers switched to carrier B and stayed up; "
            f"{', '.join(sorted(cell_lost)) or 'none'} have no carrier-B coverage and fell back to VHF or satellite. "
            "A channel-wide outage, not a station fault: no maintenance tickets.", switched + cell_lost)
    elif len(cell_lost) >= CHANNEL_WIDE_MIN:
        add("cell:wide", "channel-wide", f"Cellular outage at {len(cell_lost)} stations",
            "Several stations lost the cellular network at once while their modems read normal: a carrier or "
            "regional outage (e.g. storm damage to towers). Network-wide failover; no maintenance tickets.", cell_lost)
    else:
        for code in cell_lost:
            add(f"cell:{code}", "local", f"{code}: no cellular network",
                "The station's modem is working but cannot register: the local tower is down. "
                "Reported to the carrier; no BACSWN maintenance ticket.", [code])

    if len(noisy) >= 2:
        add("rfi:" + ",".join(noisy), "interference", "VHF interference suspected around " + ", ".join(noisy),
            "The VHF noise floor has risen at several stations while signal strength is normal: interference or "
            "possible jamming. Critical traffic is moved to satellite; reported to the spectrum authority (URCA).", noisy)

    # Path problems: one link channel down while both ends work on that channel elsewhere.
    for (a, b, ch), s in st["state"].items():
        if s["state"] != "down" or s["alarm"] or s.get("cause") not in ("signal", "cut"):
            continue                               # equipment faults and their recovery are classified above
        if any(f"hw:{x}:{ch}" in found for x in (a, b)) or any(x in d["stations"] for d in found.values()
                                                             for x in (a, b) if d["class"] != "path"):
            continue
        others = [x for x in (a, b) if any(st["state"].get(k, {}).get("state") == "up"
                                           for k in st["state"] if k[2] == ch and x in k[:2] and k[:2] != (a, b))]
        if len(others) == 2 and sim.nodes[a]["alive"] and sim.nodes[b]["alive"]:
            add(f"path:{a}-{b}:{ch}", "path", f"{a}–{b}: {comms.LABELS[ch]} path problem",
                "Both stations work on this channel with their other neighbours; only this path fails "
                "(obstruction or a marginal link). Traffic re-routes; flagged for a link-budget review.", [a, b])
    return found


# ── tick, faults, views ────────────────────────────────────────────────────

def update(sim, rng) -> None:
    """One tick of monitoring: telemetry, heartbeats, classification, then open/resolve diagnoses."""
    st = _state(sim)
    tel = {code: _telemetry(sim, n, st, rng) for code, n in sim.nodes.items()}
    sim._comms_telemetry = tel
    _heartbeats(sim, st, tel, rng)
    found = _classify(sim, st, tel)
    for key, d in found.items():
        if key not in st["diagnoses"]:
            d["since"] = sim.tick
            d["ticketed"] = False
            st["diagnoses"][key] = d
            sim._event(d["stations"][0] if len(d["stations"]) == 1 else "—", "COMMS_DIAG", d["title"])
        open_d = st["diagnoses"][key]
        if open_d["ticket"] and not open_d["ticketed"] and sim.tick - open_d["since"] >= TICKET_AFTER:
            open_d["ticketed"] = True
            sim._send_to_hub(sim.nodes[open_d["stations"][0]], "MAINT",
                             f"{open_d['stations'][0]}: {open_d['ticket']}")
    for key in [k for k in st["diagnoses"] if k not in found]:
        d = st["diagnoses"].pop(key)
        d["resolved"] = sim.tick
        st["history"].appendleft(d)
        sim._event(d["stations"][0] if len(d["stations"]) == 1 else "—", "COMMS_OK", f"Resolved: {d['title']}")


def inject(sim, kind: str, station: str | None) -> dict:
    """Comms faults for the presenter. Returns an error dict or {"ok": True, ...}."""
    st = _state(sim)
    n = sim.nodes.get(station or "")
    if kind in HW_FAULTS:
        ch, cause = HW_FAULTS[kind]
        if not n:
            return {"error": f"Unknown station {station}"}
        if ch not in n["comms"]:
            return {"error": f"{station} has no {comms.LABELS[ch]} equipment"}
        st["hw"].setdefault(station, set()).add(kind)
        comms.damage(sim, station, ch, cause, None)
    elif kind == "carrier_outage":
        st["carrier_a_down"] = True
        sim._event("—", "CARRIER_OUTAGE", "Cellular carrier A is down across the Bahamas")
    elif kind == "vhf_interference":
        if not n:
            return {"error": f"Unknown station {station}"}
        from services.mesh_network import _distance_deg
        for code, m in sim.nodes.items():
            if _distance_deg(n["lat"], n["lon"], m["lat"], m["lon"]) <= 1.0:
                st["interference"][code] = 18 if code == station else 14
        sim._event(station, "INTERFERENCE", f"Strong VHF interference near {station}")
    elif kind == "comms_restore":
        clear(sim, station)
    else:
        return {"error": f"Unknown comms fault {kind}"}
    comms._select(sim)
    return {"ok": True, "kind": kind, "station": station}


def clear(sim, station: str | None = None) -> None:
    """Remove injected comms faults (one station, or everything when station is None)."""
    st = _state(sim)
    for code in ([station] if station else list(st["hw"])):
        for kind in st["hw"].pop(code, set()):
            comms.repair(sim, code, HW_FAULTS[kind][0], "component replaced")
    if station is None:
        if st["carrier_a_down"]:
            sim._event("—", "CARRIER_RESTORED", "Cellular carrier A restored")
        st["carrier_a_down"] = False
        st["interference"].clear()
    else:
        st["interference"].pop(station, None)


def view(sim) -> dict:
    """Public comms-health view: open and resolved diagnoses, telemetry, non-up link channels,
    injected faults and thresholds."""
    st = _state(sim)
    tel = getattr(sim, "_comms_telemetry", {})
    links = []
    for (a, b, ch), s in st["state"].items():
        if s["state"] == "up":
            continue
        links.append({"a": a, "b": b, "channel": ch, "state": s["state"], "loss_pct": round(s.get("loss", 0) * 100),
                      "missed_in_row": s["miss_run"], "alarm": s["alarm"], "since_tick": s["since"]})
    order = {"equipment": 0, "channel-wide": 1, "interference": 2, "local": 3, "path": 4}
    return {
        "diagnoses": sorted(st["diagnoses"].values(), key=lambda d: (order.get(d["class"], 9), d["since"])),
        "resolved": list(st["history"])[:10],
        "stations": [{"station": code, **tel.get(code, {})} for code in sim.nodes],
        "links": sorted(links, key=lambda x: ({"down": 0, "degraded": 1}[x["state"]], x["a"], x["b"])),
        "faults": {"hardware": {k: sorted(v) for k, v in st["hw"].items()}, "carrier_a_down": st["carrier_a_down"],
                   "interference": dict(st["interference"])},
        "thresholds": {"degraded_misses": DEGRADED_MISSES, "down_misses": DOWN_MISSES,
                       "recover_good": RECOVER_GOOD, "vswr_fault": VSWR_FAULT, "interference_db": INTERFERENCE_DB},
    }
