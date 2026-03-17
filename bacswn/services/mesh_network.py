"""BACSWN — Distributed Mesh Network Simulation.

Simulates 15 intelligent station nodes forming an autonomous mesh network.
Each node has: local AI, peer communication, consensus voting, and self-diagnosis.
"""

import logging
import time
import random
import math
from datetime import datetime, timezone
from config import STATION_COORDS, BAHAMAS_STATIONS

logger = logging.getLogger("bacswn.mesh")

# ── Node state ──────────────────────────────────────────────────────
_node_states = {}
_message_log = []
_consensus_log = []
_propagation_forecasts = []

# Maximum radio range in degrees (approx 100nm ≈ 1.7 degrees)
RADIO_RANGE_DEG = 1.8


def _distance_deg(lat1, lon1, lat2, lon2):
    return math.sqrt((lat1 - lat2) ** 2 + (lon1 - lon2) ** 2)


def _build_topology():
    """Build mesh topology — each station connects to peers within radio range."""
    links = {}
    for code_a, info_a in STATION_COORDS.items():
        peers = []
        for code_b, info_b in STATION_COORDS.items():
            if code_a == code_b:
                continue
            dist = _distance_deg(info_a["lat"], info_a["lon"], info_b["lat"], info_b["lon"])
            if dist <= RADIO_RANGE_DEG:
                # Signal quality degrades with distance
                quality = max(0, min(100, int(100 - (dist / RADIO_RANGE_DEG) * 60 + random.randint(-10, 10))))
                peers.append({
                    "station": code_b,
                    "distance_nm": round(dist * 60, 1),
                    "signal_quality": quality,
                    "link_type": "vhf" if dist < 1.2 else "relay",
                    "latency_ms": int(5 + dist * 20 + random.randint(0, 15)),
                })
        links[code_a] = sorted(peers, key=lambda p: p["distance_nm"])
    return links


# Pre-compute topology
_topology = _build_topology()


def _init_nodes():
    """Initialize all station nodes with intelligent state."""
    global _node_states
    t = time.time()

    for code in BAHAMAS_STATIONS:
        info = STATION_COORDS.get(code, {})
        peers = _topology.get(code, [])

        # Simulate local AI predictions
        temp_pred = round(25 + random.gauss(0, 3), 1)
        pressure_trend = random.choice(["rising", "steady", "falling"])
        wind_pred = random.randint(5, 25)

        # Determine node health
        sensor_health = {}
        for sensor in ["temperature", "pressure", "wind", "humidity", "visibility", "ceilometer"]:
            health = random.choices(
                ["operational", "operational", "operational", "degraded", "fault"],
                weights=[70, 15, 10, 4, 1]
            )[0]
            sensor_health[sensor] = health

        fault_count = sum(1 for v in sensor_health.values() if v == "fault")
        degraded_count = sum(1 for v in sensor_health.values() if v == "degraded")

        if fault_count >= 2:
            node_status = "degraded"
        elif fault_count >= 1 or degraded_count >= 2:
            node_status = "caution"
        else:
            node_status = "healthy"

        # Autonomous mode
        hub_connected = random.random() > 0.05  # 95% hub connectivity
        autonomous_mode = not hub_connected

        _node_states[code] = {
            "station": code,
            "name": info.get("name", code),
            "lat": info.get("lat", 0),
            "lon": info.get("lon", 0),
            "status": node_status,
            "hub_connected": hub_connected,
            "autonomous_mode": autonomous_mode,
            "uptime_hours": round(random.uniform(48, 8760), 1),
            "peer_count": len(peers),
            "peers": [p["station"] for p in peers],
            "peer_links": peers,
            "sensor_health": sensor_health,
            "local_ai": {
                "model_version": "v2.4.1",
                "last_inference_ms": random.randint(12, 85),
                "predictions": {
                    "temp_3h": temp_pred,
                    "pressure_trend": pressure_trend,
                    "wind_3h_kt": wind_pred,
                    "precip_probability": random.randint(0, 80),
                    "visibility_trend": random.choice(["improving", "steady", "deteriorating"]),
                },
                "confidence": round(random.uniform(0.72, 0.96), 2),
                "anomalies_detected": random.randint(0, 3),
            },
            "messages_sent": random.randint(500, 15000),
            "messages_received": random.randint(500, 15000),
            "alerts_issued": random.randint(0, 12),
            "consensus_votes": random.randint(10, 200),
            "last_heartbeat": datetime.now(timezone.utc).isoformat(),
            "battery_pct": random.randint(70, 100) if random.random() > 0.3 else 100,
            "solar_watts": round(random.uniform(0, 45), 1),
            "comm_layers": {
                "vhf": "active",
                "cellular": random.choice(["active", "active", "degraded"]),
                "satellite": random.choice(["standby", "active"]),
                "hf": "standby",
            },
        }

    # Generate some inter-station messages
    _generate_messages()
    _generate_consensus_events()
    _generate_propagation_forecasts()


def _generate_messages():
    """Simulate recent peer-to-peer messages."""
    global _message_log
    _message_log = []
    msg_types = ["OBSERVATION", "INFERENCE", "HEARTBEAT", "ALERT", "VOTE", "ROUTE"]

    for _ in range(50):
        src = random.choice(BAHAMAS_STATIONS)
        peers = _topology.get(src, [])
        if not peers:
            continue
        dst = random.choice(peers)["station"]
        msg_type = random.choices(msg_types, weights=[40, 20, 25, 5, 5, 5])[0]

        detail = ""
        if msg_type == "OBSERVATION":
            detail = f"T={round(25+random.gauss(0,3),1)}°C P={round(1013+random.gauss(0,5),1)}hPa W={random.randint(5,25)}kt"
        elif msg_type == "INFERENCE":
            detail = random.choice([
                "Pressure falling — front approaching from SW",
                "Visibility trend deteriorating — fog likely in 2h",
                "Wind shift detected — sea breeze onset",
                "Temperature inversion detected at 850hPa",
                "CB activity developing NW of station",
            ])
        elif msg_type == "HEARTBEAT":
            detail = f"Sensors: OK | Battery: {random.randint(75,100)}% | Uptime: {random.randint(48,720)}h"
        elif msg_type == "ALERT":
            detail = random.choice([
                "IFR conditions detected — ceiling 200ft, vis 1/2SM",
                "Wind gust 45kt exceeded threshold",
                "Rapid pressure drop: -4hPa/hr",
                "Requesting consensus vote for SIGMET issuance",
            ])
        elif msg_type == "VOTE":
            detail = random.choice([
                "AGREE — confirm IFR conditions at this station",
                "AGREE — CB activity confirmed on radar",
                "DISAGREE — VFR conditions here, phenomenon may be localized",
                "ABSTAIN — sensor degraded, cannot validate",
            ])
        elif msg_type == "ROUTE":
            relay = random.choice(BAHAMAS_STATIONS)
            detail = f"Store-and-forward via {relay} → Hub"

        _message_log.append({
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "source": src,
            "destination": dst,
            "type": msg_type,
            "detail": detail,
            "latency_ms": random.randint(5, 120),
            "hops": 1 if msg_type != "ROUTE" else random.randint(2, 4),
        })


def _generate_consensus_events():
    """Simulate consensus voting events."""
    global _consensus_log
    _consensus_log = []

    events = [
        {
            "event": "IFR Alert — Nassau Area",
            "trigger_station": "MYNN",
            "participants": ["MYNN", "MYBC", "MYCB"],
            "votes": {"MYNN": "AGREE", "MYBC": "AGREE", "MYCB": "AGREE"},
            "result": "CONSENSUS REACHED — Alert issued",
            "confidence": 0.95,
            "alert_issued": True,
        },
        {
            "event": "Squall Line Detection — Northern Bahamas",
            "trigger_station": "MYGF",
            "participants": ["MYGF", "MYAM", "MYAT"],
            "votes": {"MYGF": "AGREE", "MYAM": "AGREE", "MYAT": "AGREE"},
            "result": "CONSENSUS REACHED — Squall line confirmed moving SE at 30kt",
            "confidence": 0.91,
            "alert_issued": True,
        },
        {
            "event": "Sensor Fault — Rock Sound Temperature",
            "trigger_station": "MYER",
            "participants": ["MYER", "MYEM", "MYEG"],
            "votes": {"MYER": "ABSTAIN", "MYEM": "AGREE", "MYEG": "AGREE"},
            "result": "CONSENSUS REACHED — MYER temperature sensor flagged as fault",
            "confidence": 0.88,
            "alert_issued": False,
        },
        {
            "event": "SIGMET Proposal — CB Activity",
            "trigger_station": "MYAM",
            "participants": ["MYAM", "MYAT", "MYGF", "MYNN"],
            "votes": {"MYAM": "AGREE", "MYAT": "AGREE", "MYGF": "DISAGREE", "MYNN": "AGREE"},
            "result": "CONSENSUS REACHED (3/4) — Collaborative SIGMET drafted",
            "confidence": 0.82,
            "alert_issued": True,
        },
    ]
    _consensus_log = events


def _generate_propagation_forecasts():
    """Simulate propagation forecasting between stations."""
    global _propagation_forecasts
    _propagation_forecasts = [
        {
            "source": "MYGF",
            "target": "MYAM",
            "phenomenon": "Squall line with embedded CB",
            "speed_kt": 28,
            "direction": "SE",
            "eta_minutes": 22,
            "expected_impact": "Heavy rain, gusty winds 35-45kt, temporary IFR",
            "confidence": 0.84,
        },
        {
            "source": "MYNN",
            "target": "MYBC",
            "phenomenon": "Sea breeze front",
            "speed_kt": 12,
            "direction": "W",
            "eta_minutes": 45,
            "expected_impact": "Wind shift to SW, possible afternoon showers",
            "confidence": 0.78,
        },
        {
            "source": "MYEG",
            "target": "MYLD",
            "phenomenon": "Low-level moisture surge",
            "speed_kt": 15,
            "direction": "NW",
            "eta_minutes": 60,
            "expected_impact": "Ceilings dropping to 800ft, visibility 3SM in haze",
            "confidence": 0.71,
        },
    ]


# Initialize on import
_init_nodes()


def get_mesh_status() -> dict:
    """Get full mesh network status."""
    # Refresh some dynamic values
    for code in _node_states:
        _node_states[code]["last_heartbeat"] = datetime.now(timezone.utc).isoformat()
        _node_states[code]["local_ai"]["last_inference_ms"] = random.randint(12, 85)
        _node_states[code]["solar_watts"] = round(random.uniform(0, 45), 1)

    nodes = list(_node_states.values())
    total_links = sum(len(_topology.get(code, [])) for code in BAHAMAS_STATIONS) // 2

    return {
        "nodes": nodes,
        "total_nodes": len(nodes),
        "healthy_nodes": len([n for n in nodes if n["status"] == "healthy"]),
        "degraded_nodes": len([n for n in nodes if n["status"] in ("degraded", "caution")]),
        "hub_connected": len([n for n in nodes if n["hub_connected"]]),
        "autonomous": len([n for n in nodes if n["autonomous_mode"]]),
        "total_links": total_links,
        "topology": _topology,
        "messages": _message_log[-30:],
        "consensus_events": _consensus_log,
        "propagation_forecasts": _propagation_forecasts,
        "network_health_pct": round(len([n for n in nodes if n["status"] == "healthy"]) / len(nodes) * 100, 1),
    }


def get_node_detail(station_id: str) -> dict | None:
    """Get detailed info for a single node."""
    return _node_states.get(station_id)


def trigger_consensus(event_type: str = "ifr_alert") -> dict:
    """Trigger a new consensus vote simulation."""
    stations = random.sample(BAHAMAS_STATIONS, min(4, len(BAHAMAS_STATIONS)))
    votes = {}
    for s in stations:
        votes[s] = random.choices(["AGREE", "DISAGREE", "ABSTAIN"], weights=[70, 20, 10])[0]

    agrees = sum(1 for v in votes.values() if v == "AGREE")
    quorum = len(stations) * 0.6
    reached = agrees >= quorum

    event = {
        "event": f"Consensus Vote — {event_type.replace('_', ' ').title()}",
        "trigger_station": stations[0],
        "participants": stations,
        "votes": votes,
        "result": f"CONSENSUS {'REACHED' if reached else 'NOT REACHED'} ({agrees}/{len(stations)})",
        "confidence": round(agrees / len(stations), 2),
        "alert_issued": reached,
    }
    _consensus_log.append(event)
    return event
