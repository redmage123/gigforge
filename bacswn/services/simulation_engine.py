"""BACSWN — Simulation Engine for mesh network scenario demonstrations.

Provides 6 pre-built scenarios that play out over 10 steps each, showing how
the distributed mesh network responds to real-world weather and fault events.
"""

from config import STATION_COORDS, BAHAMAS_STATIONS

# Default baseline state for all stations
def _baseline_node(station_code):
    info = STATION_COORDS.get(station_code, {})
    return {
        "station": station_code,
        "name": info.get("name", station_code),
        "lat": info.get("lat", 0),
        "lon": info.get("lon", 0),
        "status": "healthy",
        "hub_connected": True,
        "autonomous_mode": False,
        "alert_level": "normal",
        "pressure_hpa": 1013.2,
        "wind_kt": 12,
        "visibility_sm": 10,
        "ceiling_ft": 25000,
        "temperature_c": 28.0,
        "detection": None,
    }


def _all_nodes(**overrides_by_station):
    """Build all 15 station nodes with optional per-station overrides."""
    nodes = []
    for code in BAHAMAS_STATIONS:
        node = _baseline_node(code)
        if code in overrides_by_station:
            node.update(overrides_by_station[code])
        nodes.append(node)
    return nodes


# ── Scenario Registry ───────────────────────────────────────────────────

SCENARIOS = [
    {
        "id": "hurricane_landfall",
        "name": "Hurricane Cat 4 Landfall on Abaco",
        "description": "A Category 4 hurricane approaches Abaco from the southeast. Watch stations detect pressure drops, lose hub connectivity, and switch to autonomous satellite operations while the mesh maintains resilience.",
        "icon": "hurricane",
        "category": "severe_weather",
    },
    {
        "id": "squall_line",
        "name": "Squall Line Crossing Northern Bahamas",
        "description": "A powerful squall line sweeps NW to SE across Grand Bahama, Abaco, and Treasure Cay. Stations detect and warn each other via propagation forecasting and collaboratively draft a SIGMET.",
        "icon": "storm",
        "category": "weather_event",
    },
    {
        "id": "sensor_fault",
        "name": "Sensor Fault at Nassau (MYNN)",
        "description": "Nassau's temperature sensor begins reporting erratic values. Neighboring stations detect the anomaly through cross-validation and consensus voting flags the fault automatically.",
        "icon": "fault",
        "category": "equipment",
    },
    {
        "id": "hub_failure",
        "name": "Total Hub Failure",
        "description": "The central hub goes completely offline. All 15 stations switch to autonomous mode and continue peer-to-peer operations, demonstrating full network resilience without any central coordination.",
        "icon": "network",
        "category": "infrastructure",
    },
    {
        "id": "ifr_event",
        "name": "Multi-Station IFR Event",
        "description": "Dense fog rolls across the central Bahamas. Multiple stations detect IFR conditions sequentially, consensus voting confirms the widespread event, and an automated SIGMET is issued.",
        "icon": "fog",
        "category": "aviation",
    },
    {
        "id": "tropical_wave",
        "name": "Tropical Wave Detection",
        "description": "A subtle tropical wave passes through the Bahamas. No single station can identify it, but the mesh collectively correlates pressure oscillations across 5+ stations to detect the passage.",
        "icon": "wave",
        "category": "detection",
    },
]


def get_scenarios():
    """Return list of available scenarios."""
    return SCENARIOS


# ── Scenario 1: Hurricane Cat 4 Landfall on Abaco ───────────────────────

def _hurricane_landfall(step):
    total_steps = 10
    # Storm approaches from SE, hits Abaco (MYAM lat 26.5, MYAT lat 26.7)
    # Pressure drops from 1013 to ~940 at landfall
    narrations = [
        "T-120 min: Tropical storm approaching from the southeast. All stations reporting normal operations. MYES (San Salvador) begins detecting a subtle barometric pressure drop — first indication of the approaching system.",
        "T-100 min: MYES confirms sustained pressure drop of 2 hPa/hr. Wind increasing to 25 kt from the east. MYES sends OBSERVATION message to MYEG and MYLD with early detection data.",
        "T-80 min: Pressure drop now detected at MYEG (Exuma) and MYLD (Long Island). Storm track analysis suggests NW movement toward Abaco. MYER (Rock Sound) detecting increased easterly swell. Network-wide advisory issued.",
        "T-60 min: Storm intensifying rapidly — now estimated Cat 2. MYEM (Governor's Harbour) reporting 45 kt gusts. MYNN (Nassau) detects pressure falling. Consensus vote initiated for Watch status on northern stations.",
        "T-45 min: Cat 3 intensity reached. MYAM (Marsh Harbour) pressure dropping sharply — 998 hPa and falling. Hub connectivity becoming intermittent to Abaco stations. MYAT (Treasure Cay) activating satellite backup.",
        "T-30 min: CRITICAL — Hurricane now Cat 4 with 130 kt winds. MYAM loses hub connectivity — switches to AUTONOMOUS MODE with satellite uplink. MYAT follows. Both stations continue full operations via mesh relay through MYGF.",
        "T-15 min: Eye wall approaching Abaco. MYAM pressure at 955 hPa, winds 110 kt. MYAT reporting 95 kt. Emergency alerts issued autonomously. MYGF (Freeport) relaying all Abaco data to hub via mesh.",
        "T-0: LANDFALL on Abaco. MYAM pressure bottoms at 942 hPa, sustained winds 125 kt. Station in survival mode — reduced reporting frequency but still transmitting via satellite. MYAT gusting 140 kt.",
        "T+15 min: Eye passage over Marsh Harbour. MYAM reports brief calm — pressure 940 hPa, winds dropping momentarily. MYAT still in eyewall — 130 kt sustained. Network routing all Abaco traffic through MYGF and MYBS backup paths.",
        "T+30 min: Storm moving NW past Abaco. MYAM pressure rising to 960 hPa. Wind shifting to SW 90 kt. MYAT beginning to recover. Hub reconnection attempts starting. Mesh network maintained continuous data flow throughout — zero data loss confirmed.",
    ]

    nodes_overrides = [
        # Step 0: Normal
        {},
        # Step 1: MYES and MYMM detect (southeastern stations first)
        {"MYES": {"pressure_hpa": 1010.5, "wind_kt": 25, "detection": "pressure_dropping", "alert_level": "advisory"},
         "MYMM": {"pressure_hpa": 1011.0, "wind_kt": 20, "detection": "pressure_dropping", "alert_level": "advisory"},
         "MYIG": {"pressure_hpa": 1011.5, "wind_kt": 18, "detection": "pressure_dropping", "alert_level": "advisory"}},
        # Step 2: Storm spreading NW — MYEG, MYLD, MYMM degrading
        {"MYES": {"pressure_hpa": 1008.0, "wind_kt": 30, "detection": "pressure_dropping", "alert_level": "advisory"},
         "MYMM": {"pressure_hpa": 1008.5, "wind_kt": 28, "detection": "storm_approach", "alert_level": "watch", "status": "caution"},
         "MYIG": {"pressure_hpa": 1009.0, "wind_kt": 25, "detection": "pressure_dropping", "alert_level": "advisory"},
         "MYEG": {"pressure_hpa": 1010.0, "wind_kt": 20, "detection": "pressure_dropping", "alert_level": "advisory"},
         "MYLD": {"pressure_hpa": 1010.5, "wind_kt": 18, "detection": "pressure_dropping", "alert_level": "advisory"}},
        # Step 3: Spreading north — MYMM in storm band
        {"MYES": {"pressure_hpa": 1005.0, "wind_kt": 40, "detection": "storm_approach", "alert_level": "watch", "status": "caution"},
         "MYMM": {"pressure_hpa": 1004.0, "wind_kt": 42, "detection": "storm_passage", "alert_level": "warning", "status": "caution"},
         "MYIG": {"pressure_hpa": 1006.0, "wind_kt": 35, "detection": "storm_approach", "alert_level": "watch", "status": "caution"},
         "MYEG": {"pressure_hpa": 1007.0, "wind_kt": 30, "detection": "pressure_dropping", "alert_level": "advisory"},
         "MYLD": {"pressure_hpa": 1008.0, "wind_kt": 25, "detection": "pressure_dropping", "alert_level": "advisory"},
         "MYEM": {"pressure_hpa": 1009.0, "wind_kt": 45, "detection": "squall_detected", "alert_level": "watch", "status": "caution"},
         "MYNN": {"pressure_hpa": 1010.0, "wind_kt": 22, "detection": "pressure_dropping", "alert_level": "advisory"},
         "MYER": {"pressure_hpa": 1008.5, "wind_kt": 28, "detection": "swell_increasing", "alert_level": "advisory"}},
        # Step 4: Cat 3 approaching Abaco — SE stations in storm band
        {"MYAM": {"pressure_hpa": 998.0, "wind_kt": 55, "detection": "hurricane_approach", "alert_level": "warning", "status": "caution"},
         "MYAT": {"pressure_hpa": 1000.0, "wind_kt": 48, "detection": "hurricane_approach", "alert_level": "warning", "status": "caution"},
         "MYGF": {"pressure_hpa": 1004.0, "wind_kt": 40, "detection": "pressure_dropping", "alert_level": "watch"},
         "MYNN": {"pressure_hpa": 1006.0, "wind_kt": 35, "detection": "pressure_dropping", "alert_level": "watch"},
         "MYES": {"pressure_hpa": 1002.0, "wind_kt": 50, "detection": "storm_passage", "alert_level": "warning", "status": "caution"},
         "MYMM": {"pressure_hpa": 1000.0, "wind_kt": 55, "detection": "storm_passage", "alert_level": "warning", "status": "caution"},
         "MYIG": {"pressure_hpa": 1003.0, "wind_kt": 42, "detection": "storm_passage", "alert_level": "warning", "status": "caution"},
         "MYEM": {"pressure_hpa": 1005.0, "wind_kt": 50, "detection": "storm_approach", "alert_level": "watch", "status": "caution"},
         "MYER": {"pressure_hpa": 1005.0, "wind_kt": 40, "detection": "storm_approach", "alert_level": "watch"},
         "MYEG": {"pressure_hpa": 1004.0, "wind_kt": 35, "detection": "pressure_dropping", "alert_level": "watch"},
         "MYLD": {"pressure_hpa": 1005.5, "wind_kt": 30, "detection": "pressure_dropping", "alert_level": "advisory"},
         "MYRD": {"pressure_hpa": 1007.0, "wind_kt": 25, "detection": "pressure_dropping", "alert_level": "advisory"}},
        # Step 5: Cat 4, Abaco losing hub
        {"MYAM": {"pressure_hpa": 975.0, "wind_kt": 85, "detection": "hurricane_imminent", "alert_level": "emergency", "status": "degraded", "hub_connected": False, "autonomous_mode": True},
         "MYAT": {"pressure_hpa": 980.0, "wind_kt": 75, "detection": "hurricane_imminent", "alert_level": "emergency", "status": "degraded", "hub_connected": False, "autonomous_mode": True},
         "MYGF": {"pressure_hpa": 998.0, "wind_kt": 55, "detection": "hurricane_approach", "alert_level": "warning", "status": "caution"},
         "MYNN": {"pressure_hpa": 1002.0, "wind_kt": 42, "detection": "storm_approach", "alert_level": "watch"},
         "MYBS": {"pressure_hpa": 1004.0, "wind_kt": 35, "detection": "pressure_dropping", "alert_level": "watch"},
         "MYBC": {"pressure_hpa": 1004.0, "wind_kt": 30, "detection": "pressure_dropping", "alert_level": "advisory"},
         "MYEM": {"pressure_hpa": 1001.0, "wind_kt": 55, "detection": "storm_passage", "alert_level": "warning", "status": "caution"},
         "MYER": {"pressure_hpa": 1002.0, "wind_kt": 45, "detection": "storm_passage", "alert_level": "warning"},
         "MYES": {"pressure_hpa": 1004.0, "wind_kt": 40, "detection": "storm_clearing", "alert_level": "watch"},
         "MYEG": {"pressure_hpa": 1003.0, "wind_kt": 38, "detection": "storm_approach", "alert_level": "watch"}},
        # Step 6: Eyewall on Abaco
        {"MYAM": {"pressure_hpa": 955.0, "wind_kt": 110, "detection": "hurricane_eyewall", "alert_level": "emergency", "status": "degraded", "hub_connected": False, "autonomous_mode": True},
         "MYAT": {"pressure_hpa": 962.0, "wind_kt": 95, "detection": "hurricane_eyewall", "alert_level": "emergency", "status": "degraded", "hub_connected": False, "autonomous_mode": True},
         "MYGF": {"pressure_hpa": 992.0, "wind_kt": 65, "detection": "hurricane_approach", "alert_level": "warning", "status": "caution"},
         "MYNN": {"pressure_hpa": 998.0, "wind_kt": 48, "detection": "storm_approach", "alert_level": "watch", "status": "caution"},
         "MYBS": {"pressure_hpa": 1000.0, "wind_kt": 42, "detection": "pressure_dropping", "alert_level": "watch"},
         "MYBC": {"pressure_hpa": 1001.0, "wind_kt": 35, "detection": "pressure_dropping", "alert_level": "advisory"},
         "MYEM": {"pressure_hpa": 999.0, "wind_kt": 55, "detection": "storm_passage", "alert_level": "warning", "status": "caution"},
         "MYER": {"pressure_hpa": 1000.0, "wind_kt": 48, "detection": "storm_passage", "alert_level": "warning"},
         "MYCB": {"pressure_hpa": 1002.0, "wind_kt": 30, "detection": "pressure_dropping", "alert_level": "advisory"}},
        # Step 7: Landfall
        {"MYAM": {"pressure_hpa": 942.0, "wind_kt": 125, "detection": "hurricane_landfall", "alert_level": "emergency", "status": "degraded", "hub_connected": False, "autonomous_mode": True},
         "MYAT": {"pressure_hpa": 950.0, "wind_kt": 140, "detection": "hurricane_eyewall", "alert_level": "emergency", "status": "degraded", "hub_connected": False, "autonomous_mode": True},
         "MYGF": {"pressure_hpa": 988.0, "wind_kt": 72, "detection": "hurricane_approach", "alert_level": "warning", "status": "caution", "hub_connected": False, "autonomous_mode": True},
         "MYNN": {"pressure_hpa": 995.0, "wind_kt": 52, "detection": "storm_passage", "alert_level": "warning", "status": "caution"},
         "MYBS": {"pressure_hpa": 997.0, "wind_kt": 48, "detection": "storm_approach", "alert_level": "watch"},
         "MYBC": {"pressure_hpa": 999.0, "wind_kt": 38, "detection": "pressure_dropping", "alert_level": "watch"},
         "MYEM": {"pressure_hpa": 997.0, "wind_kt": 50, "detection": "storm_passage", "alert_level": "warning", "status": "caution"},
         "MYER": {"pressure_hpa": 998.0, "wind_kt": 45, "detection": "storm_passage", "alert_level": "warning"},
         "MYCB": {"pressure_hpa": 1000.0, "wind_kt": 35, "detection": "pressure_dropping", "alert_level": "watch"}},
        # Step 8: Eye passage
        {"MYAM": {"pressure_hpa": 940.0, "wind_kt": 15, "detection": "hurricane_eye_passage", "alert_level": "emergency", "status": "degraded", "hub_connected": False, "autonomous_mode": True},
         "MYAT": {"pressure_hpa": 948.0, "wind_kt": 130, "detection": "hurricane_eyewall", "alert_level": "emergency", "status": "degraded", "hub_connected": False, "autonomous_mode": True},
         "MYGF": {"pressure_hpa": 985.0, "wind_kt": 78, "detection": "hurricane_passage", "alert_level": "warning", "status": "caution", "hub_connected": False, "autonomous_mode": True},
         "MYNN": {"pressure_hpa": 993.0, "wind_kt": 55, "detection": "storm_passage", "alert_level": "warning", "status": "caution"},
         "MYBS": {"pressure_hpa": 996.0, "wind_kt": 50, "detection": "storm_passage", "alert_level": "watch"},
         "MYBC": {"pressure_hpa": 998.0, "wind_kt": 40, "detection": "storm_approach", "alert_level": "watch"},
         "MYEM": {"pressure_hpa": 998.0, "wind_kt": 45, "detection": "storm_clearing", "alert_level": "watch"},
         "MYER": {"pressure_hpa": 999.0, "wind_kt": 40, "detection": "storm_clearing", "alert_level": "watch"},
         "MYCB": {"pressure_hpa": 999.0, "wind_kt": 38, "detection": "pressure_dropping", "alert_level": "watch"}},
        # Step 9: Recovery
        {"MYAM": {"pressure_hpa": 960.0, "wind_kt": 90, "detection": "hurricane_departing", "alert_level": "emergency", "status": "degraded", "hub_connected": False, "autonomous_mode": True},
         "MYAT": {"pressure_hpa": 965.0, "wind_kt": 80, "detection": "hurricane_departing", "alert_level": "warning", "status": "caution", "hub_connected": False, "autonomous_mode": True},
         "MYGF": {"pressure_hpa": 990.0, "wind_kt": 60, "detection": "storm_clearing", "alert_level": "warning", "status": "caution"},
         "MYNN": {"pressure_hpa": 996.0, "wind_kt": 45, "detection": "storm_clearing", "alert_level": "watch"},
         "MYBS": {"pressure_hpa": 998.0, "wind_kt": 40, "detection": "storm_clearing", "alert_level": "watch"},
         "MYBC": {"pressure_hpa": 999.0, "wind_kt": 35, "detection": "storm_clearing", "alert_level": "advisory"},
         "MYEM": {"pressure_hpa": 1001.0, "wind_kt": 35, "detection": "recovering", "alert_level": "advisory"},
         "MYER": {"pressure_hpa": 1002.0, "wind_kt": 30, "detection": "recovering", "alert_level": "advisory"},
         "MYCB": {"pressure_hpa": 1001.0, "wind_kt": 30, "detection": "storm_clearing", "alert_level": "advisory"}},
    ]

    messages_per_step = [
        [],
        [{"from": "MYES", "to": "MYEG", "type": "OBSERVATION", "text": "Pressure falling 2 hPa/hr, wind E 25kt increasing"},
         {"from": "MYES", "to": "MYLD", "type": "OBSERVATION", "text": "Barometric trend indicates approaching tropical system"}],
        [{"from": "MYEG", "to": "MYNN", "type": "OBSERVATION", "text": "Confirming pressure drop — now 1010 hPa and falling"},
         {"from": "MYLD", "to": "MYEG", "type": "INFERENCE", "text": "Storm track analysis: NW movement, Abaco in projected path"}],
        [{"from": "MYEM", "to": "MYAM", "type": "ALERT", "text": "Cat 2 hurricane intensifying rapidly, 45kt gusts here, heading your direction"},
         {"from": "MYNN", "to": "MYAM", "type": "ALERT", "text": "Initiating consensus vote for Hurricane Watch status — northern stations"},
         {"from": "MYER", "to": "MYNN", "type": "OBSERVATION", "text": "Easterly swell increasing, consistent with approaching hurricane"}],
        [{"from": "MYAM", "to": "MYAT", "type": "ALERT", "text": "Hub connectivity degrading — prepare satellite backup activation"},
         {"from": "MYAM", "to": "MYGF", "type": "ALERT", "text": "Request mesh relay — hub intermittent, may need you to forward our data"},
         {"from": "MYGF", "to": "MYAM", "type": "ALERT", "text": "Confirmed — will relay your observations to hub via our connection"}],
        [{"from": "MYAM", "to": "MYGF", "type": "ALERT", "text": "AUTONOMOUS MODE ACTIVE — satellite uplink engaged, relaying via mesh"},
         {"from": "MYAT", "to": "MYGF", "type": "ALERT", "text": "Hub lost — switching to autonomous. All data via satellite and mesh relay"},
         {"from": "MYGF", "to": "MYNN", "type": "OBSERVATION", "text": "Relaying Abaco station data — both MYAM and MYAT now autonomous"}],
        [{"from": "MYAM", "to": "MYGF", "type": "ALERT", "text": "EYEWALL CONTACT — 110kt sustained, pressure 955hPa. Station holding."},
         {"from": "MYAT", "to": "MYGF", "type": "ALERT", "text": "95kt sustained winds, pressure 962hPa. Satellite uplink stable."},
         {"from": "MYGF", "to": "MYNN", "type": "OBSERVATION", "text": "Both Abaco stations in eyewall — continuous data relay maintained"}],
        [{"from": "MYAM", "to": "MYGF", "type": "ALERT", "text": "LANDFALL CONFIRMED — 125kt sustained, 942hPa. Survival mode engaged."},
         {"from": "MYAT", "to": "MYGF", "type": "ALERT", "text": "140kt gust recorded — strongest in station history. All sensors operational."},
         {"from": "MYGF", "to": "MYBS", "type": "ALERT", "text": "Backup relay path request — primary path to hub saturated"}],
        [{"from": "MYAM", "to": "MYGF", "type": "OBSERVATION", "text": "EYE PASSAGE — calm winds, 940hPa. Brief window for damage assessment."},
         {"from": "MYAT", "to": "MYGF", "type": "ALERT", "text": "Still in eyewall — 130kt. MYAM in eye. Second eyewall imminent for MYAM."},
         {"from": "MYGF", "to": "MYNN", "type": "OBSERVATION", "text": "MYAM eye passage confirmed. Zero data gaps throughout event."}],
        [{"from": "MYAM", "to": "MYGF", "type": "OBSERVATION", "text": "Storm departing — pressure rising 960hPa. Winds SW 90kt and decreasing."},
         {"from": "MYAT", "to": "MYGF", "type": "OBSERVATION", "text": "Winds subsiding to 80kt. Attempting hub reconnection."},
         {"from": "MYGF", "to": "MYNN", "type": "OBSERVATION", "text": "Mesh network maintained 100% data continuity. Zero messages lost. Autonomous ops successful."}],
    ]

    consensus_per_step = [
        [], [], [],
        [{"event": "Hurricane Watch — Northern Bahamas", "votes": {"MYAM": "AGREE", "MYAT": "AGREE", "MYGF": "AGREE", "MYNN": "AGREE"}, "result": "REACHED"}],
        [{"event": "Hurricane Warning — Abaco Stations", "votes": {"MYAM": "AGREE", "MYAT": "AGREE", "MYGF": "AGREE", "MYNN": "AGREE", "MYBS": "AGREE"}, "result": "REACHED"}],
        [{"event": "Emergency Alert — Cat 4 Imminent", "votes": {"MYAM": "AGREE", "MYAT": "AGREE", "MYGF": "AGREE"}, "result": "REACHED"}],
        [], [],
        [{"event": "Continuous Operation Verification", "votes": {"MYAM": "AGREE", "MYAT": "AGREE", "MYGF": "AGREE", "MYNN": "AGREE"}, "result": "REACHED"}],
        [{"event": "All-Clear Assessment — Preliminary", "votes": {"MYAM": "DISAGREE", "MYAT": "DISAGREE", "MYGF": "AGREE", "MYNN": "AGREE"}, "result": "NOT REACHED"}],
    ]

    alerts_per_step = [
        [], [],
        [{"station": "MYES", "type": "ADVISORY", "text": "Tropical system approaching from SE — pressure falling 2 hPa/hr"}],
        [{"station": "MYEM", "type": "WATCH", "text": "Hurricane Watch — rapidly intensifying system approaching"}],
        [{"station": "MYAM", "type": "WARNING", "text": "Hurricane Warning — Cat 3 hurricane approaching Abaco, ETA 45 min"}],
        [{"station": "MYAM", "type": "EMERGENCY", "text": "AUTONOMOUS EMERGENCY ALERT — Cat 4 hurricane imminent, 130kt winds expected"},
         {"station": "MYAT", "type": "EMERGENCY", "text": "AUTONOMOUS EMERGENCY ALERT — Hub lost, satellite ops active, Cat 4 imminent"}],
        [{"station": "MYAM", "type": "EMERGENCY", "text": "EYEWALL CONTACT — 110kt sustained winds, all aircraft operations suspended"},
         {"station": "MYGF", "type": "WARNING", "text": "Hurricane conditions approaching Freeport — 65kt winds and increasing"}],
        [{"station": "MYAM", "type": "EMERGENCY", "text": "HURRICANE LANDFALL — 125kt sustained, 942hPa, survival mode"}],
        [{"station": "MYAM", "type": "EMERGENCY", "text": "Eye passage — temporary calm, second eyewall approach imminent"}],
        [{"station": "MYGF", "type": "ADVISORY", "text": "Network resilience confirmed — mesh maintained continuous operations throughout Cat 4 landfall"}],
    ]

    propagation_per_step = [
        [], [],
        [{"from": "MYES", "to": "MYAM", "phenomenon": "Hurricane track", "eta_min": 120}],
        [{"from": "MYEM", "to": "MYAM", "phenomenon": "Cat 2 hurricane", "eta_min": 60},
         {"from": "MYER", "to": "MYAM", "phenomenon": "Storm surge", "eta_min": 75}],
        [{"from": "MYNN", "to": "MYAM", "phenomenon": "Cat 3 hurricane", "eta_min": 45}],
        [{"from": "MYGF", "to": "MYAM", "phenomenon": "Cat 4 eyewall", "eta_min": 30}],
        [{"from": "MYAM", "to": "MYGF", "phenomenon": "Cat 4 hurricane", "eta_min": 90}],
        [{"from": "MYAM", "to": "MYGF", "phenomenon": "Hurricane passage", "eta_min": 45}],
        [], [],
    ]

    # Hurricane track — position at each step (approaching from SE, hitting Abaco, moving NW)
    hurricane_positions = [
        {"lat": 22.0, "lon": -72.0, "category": 1, "wind_mph": 80, "name": "Hurricane Delta", "pressure_mb": 990},
        {"lat": 22.8, "lon": -72.8, "category": 1, "wind_mph": 85, "name": "Hurricane Delta", "pressure_mb": 987},
        {"lat": 23.5, "lon": -73.5, "category": 2, "wind_mph": 105, "name": "Hurricane Delta", "pressure_mb": 978},
        {"lat": 24.2, "lon": -74.2, "category": 2, "wind_mph": 110, "name": "Hurricane Delta", "pressure_mb": 972},
        {"lat": 25.0, "lon": -75.0, "category": 3, "wind_mph": 125, "name": "Hurricane Delta", "pressure_mb": 960},
        {"lat": 25.8, "lon": -76.0, "category": 4, "wind_mph": 145, "name": "Hurricane Delta", "pressure_mb": 948},
        {"lat": 26.3, "lon": -76.8, "category": 4, "wind_mph": 155, "name": "Hurricane Delta", "pressure_mb": 942},
        {"lat": 26.5, "lon": -77.1, "category": 4, "wind_mph": 160, "name": "Hurricane Delta", "pressure_mb": 940},
        {"lat": 26.6, "lon": -77.2, "category": 4, "wind_mph": 150, "name": "Hurricane Delta", "pressure_mb": 942},
        {"lat": 27.0, "lon": -77.8, "category": 3, "wind_mph": 120, "name": "Hurricane Delta", "pressure_mb": 958},
    ]

    # Forecast cone — extends ahead of current position
    def _cone(pos_idx):
        pts = hurricane_positions[pos_idx:]
        if len(pts) < 2:
            return []
        track = [[p["lat"], p["lon"]] for p in pts]
        cone = []
        for i, pt in enumerate(track):
            r = 0.3 + i * 0.15
            cone.append([pt[0] + r, pt[1] - r * 0.5])
        for pt in reversed(track):
            i = track.index(pt)
            r = 0.3 + i * 0.15
            cone.append([pt[0] - r, pt[1] + r * 0.5])
        if cone:
            cone.append(cone[0])
        return cone

    s = min(step, total_steps - 1)
    hp = hurricane_positions[s]
    forecast_track = [[p["lat"], p["lon"]] for p in hurricane_positions[s:]]

    return {
        "scenario_id": "hurricane_landfall",
        "scenario_name": "Hurricane Cat 4 Landfall on Abaco",
        "step": s,
        "total_steps": total_steps,
        "elapsed_minutes": s * 15,
        "narration": narrations[s],
        "nodes": _all_nodes(**nodes_overrides[s]),
        "active_messages": messages_per_step[s],
        "consensus_votes": consensus_per_step[s],
        "alerts_issued": alerts_per_step[s],
        "propagation_forecasts": propagation_per_step[s],
        "hurricane": {
            "lat": hp["lat"],
            "lon": hp["lon"],
            "category": hp["category"],
            "wind_mph": hp["wind_mph"],
            "name": hp["name"],
            "pressure_mb": hp["pressure_mb"],
            "forecast_track": forecast_track,
            "cone_polygon": _cone(s),
        },
    }


# ── Scenario 2: Squall Line Crossing Northern Bahamas ────────────────────

def _squall_line(step):
    total_steps = 10
    narrations = [
        "T+0 min: Calm conditions across Northern Bahamas. A cold front is approaching from the northwest. MYGF (Freeport) wind sensors detect a subtle wind shift — the first sign of the incoming squall line.",
        "T+10 min: MYGF confirms squall line detection — barometric pressure dropped 3 hPa in 10 minutes. Cumulonimbus tops visible on ceilometer. Station sends propagation forecast to MYAM with 18-minute ETA.",
        "T+20 min: Squall line hits MYGF — heavy rain, 45 kt gusts, visibility drops to 1 SM. MYGF transmits real-time impact data to MYAM and MYAT so they know exactly what's coming.",
        "T+30 min: MYAM (Marsh Harbour) detecting pressure drop and wind shift. MYGF's propagation forecast was accurate within 2 minutes. MYAM prepares automated warnings for local aviation.",
        "T+40 min: Squall line reaches MYAM — 40 kt gusts, heavy rain, 3/4 SM visibility. IFR conditions. MYAM issues local SPECI and warns MYAT with 15-minute ETA. Consensus vote initiated for collaborative SIGMET.",
        "T+50 min: Three-station consensus vote (MYGF, MYAM, MYAT) — all AGREE on squall line characteristics. Collaborative SIGMET drafted: embedded CB, tops FL380, moving SE at 30 kt.",
        "T+55 min: MYAT (Treasure Cay) now detecting the squall line approach. Wind shifting, pressure dropping. SIGMET transmitted to all stations and hub. MYGF beginning to clear — visibility improving.",
        "T+65 min: Squall line hits MYAT — 42 kt gusts, heavy rain. MYGF has fully cleared — VFR restored. Network demonstrates seamless station-to-station weather tracking.",
        "T+75 min: MYAT clearing. All three stations have now experienced the squall line. Post-event analysis: propagation forecasts were accurate to within 3 minutes average across all stations.",
        "T+85 min: Squall line moving into open ocean SE of Abaco. All stations back to VFR. Collaborative SIGMET canceled by consensus vote. Network performance report: 100% detection rate, 3 successful propagation forecasts.",
    ]

    nodes_overrides = [
        # Step 0: Calm, MYGF first detect
        {"MYGF": {"wind_kt": 18, "detection": "wind_shift_detected", "alert_level": "advisory"}},
        # Step 1: MYGF confirms
        {"MYGF": {"pressure_hpa": 1010.0, "wind_kt": 28, "detection": "squall_line_detected", "alert_level": "watch", "status": "caution"}},
        # Step 2: Squall hits MYGF
        {"MYGF": {"pressure_hpa": 1006.0, "wind_kt": 45, "visibility_sm": 1, "ceiling_ft": 800, "detection": "squall_line_impact", "alert_level": "warning", "status": "degraded"}},
        # Step 3: MYAM detecting
        {"MYGF": {"pressure_hpa": 1005.0, "wind_kt": 40, "visibility_sm": 1.5, "ceiling_ft": 1200, "detection": "squall_line_impact", "alert_level": "warning", "status": "caution"},
         "MYAM": {"pressure_hpa": 1010.0, "wind_kt": 22, "detection": "pressure_dropping", "alert_level": "advisory"}},
        # Step 4: Squall hits MYAM
        {"MYGF": {"pressure_hpa": 1007.0, "wind_kt": 30, "visibility_sm": 3, "ceiling_ft": 2500, "detection": "squall_clearing", "alert_level": "watch"},
         "MYAM": {"pressure_hpa": 1005.0, "wind_kt": 40, "visibility_sm": 0.75, "ceiling_ft": 600, "detection": "squall_line_impact", "alert_level": "warning", "status": "degraded"}},
        # Step 5: Consensus vote
        {"MYGF": {"pressure_hpa": 1009.0, "wind_kt": 22, "visibility_sm": 5, "ceiling_ft": 5000, "detection": "clearing", "alert_level": "advisory"},
         "MYAM": {"pressure_hpa": 1004.0, "wind_kt": 38, "visibility_sm": 1, "ceiling_ft": 700, "detection": "squall_line_impact", "alert_level": "warning", "status": "caution"},
         "MYAT": {"pressure_hpa": 1010.0, "wind_kt": 18, "detection": "pressure_dropping", "alert_level": "advisory"}},
        # Step 6: MYAT detecting
        {"MYGF": {"pressure_hpa": 1011.0, "wind_kt": 15, "visibility_sm": 8, "ceiling_ft": 12000, "detection": "clearing", "alert_level": "advisory"},
         "MYAM": {"pressure_hpa": 1006.0, "wind_kt": 30, "visibility_sm": 2, "ceiling_ft": 1500, "detection": "squall_clearing", "alert_level": "watch"},
         "MYAT": {"pressure_hpa": 1008.0, "wind_kt": 25, "detection": "squall_approaching", "alert_level": "watch", "status": "caution"}},
        # Step 7: Squall hits MYAT
        {"MYGF": {"pressure_hpa": 1013.0, "wind_kt": 12, "visibility_sm": 10, "detection": None, "alert_level": "normal"},
         "MYAM": {"pressure_hpa": 1009.0, "wind_kt": 20, "visibility_sm": 5, "ceiling_ft": 5000, "detection": "clearing", "alert_level": "advisory"},
         "MYAT": {"pressure_hpa": 1005.0, "wind_kt": 42, "visibility_sm": 1, "ceiling_ft": 700, "detection": "squall_line_impact", "alert_level": "warning", "status": "degraded"}},
        # Step 8: MYAT clearing
        {"MYGF": {"pressure_hpa": 1013.0, "wind_kt": 10, "visibility_sm": 10, "detection": None, "alert_level": "normal"},
         "MYAM": {"pressure_hpa": 1012.0, "wind_kt": 14, "visibility_sm": 10, "detection": None, "alert_level": "normal"},
         "MYAT": {"pressure_hpa": 1008.0, "wind_kt": 25, "visibility_sm": 3, "ceiling_ft": 2000, "detection": "squall_clearing", "alert_level": "watch"}},
        # Step 9: All clear
        {},
    ]

    messages_per_step = [
        [{"from": "MYGF", "to": "MYAM", "type": "OBSERVATION", "text": "Wind shift detected — possible incoming frontal boundary"}],
        [{"from": "MYGF", "to": "MYAM", "type": "ALERT", "text": "Squall line confirmed — CB tops visible, pressure dropping 3hPa/10min"},
         {"from": "MYGF", "to": "MYAT", "type": "ALERT", "text": "Propagation forecast: squall line ETA your station ~35 min"}],
        [{"from": "MYGF", "to": "MYAM", "type": "OBSERVATION", "text": "SQUALL IMPACT — 45kt gusts, vis 1SM, heavy rain. This is what's heading your way."},
         {"from": "MYGF", "to": "MYNN", "type": "OBSERVATION", "text": "Squall line crossing Freeport — embedded CB, intense rain"}],
        [{"from": "MYAM", "to": "MYAT", "type": "ALERT", "text": "Squall approaching — MYGF data confirms heavy impact. Preparing warnings."},
         {"from": "MYAM", "to": "MYNN", "type": "OBSERVATION", "text": "Pressure dropping, wind shifting — squall line arrival imminent"}],
        [{"from": "MYAM", "to": "MYAT", "type": "ALERT", "text": "SQUALL HIT — 40kt gusts, 3/4SM vis, IFR. ETA your station 15min."},
         {"from": "MYAM", "to": "MYGF", "type": "VOTE", "text": "Initiating consensus vote for collaborative SIGMET issuance"}],
        [{"from": "MYGF", "to": "MYAM", "type": "VOTE", "text": "AGREE — confirm squall characteristics, SIGMET warranted"},
         {"from": "MYAT", "to": "MYAM", "type": "VOTE", "text": "AGREE — pressure dropping here, squall approach confirmed"}],
        [{"from": "MYAM", "to": "MYNN", "type": "ALERT", "text": "SIGMET ISSUED — Squall line with embedded CB, tops FL380, moving SE 30kt"},
         {"from": "MYAT", "to": "MYAM", "type": "OBSERVATION", "text": "Squall line approaching — wind shifting, pressure dropping rapidly"}],
        [{"from": "MYAT", "to": "MYNN", "type": "OBSERVATION", "text": "SQUALL IMPACT — 42kt gusts, heavy rain, IFR conditions"},
         {"from": "MYGF", "to": "MYNN", "type": "OBSERVATION", "text": "Freeport VFR restored — squall fully cleared"}],
        [{"from": "MYAT", "to": "MYAM", "type": "OBSERVATION", "text": "Clearing — winds subsiding, visibility improving"},
         {"from": "MYAM", "to": "MYNN", "type": "INFERENCE", "text": "Post-analysis: propagation forecasts accurate to within 3 min average"}],
        [{"from": "MYAM", "to": "MYNN", "type": "OBSERVATION", "text": "All stations VFR. SIGMET cancellation vote initiated."},
         {"from": "MYGF", "to": "MYNN", "type": "OBSERVATION", "text": "Network performance: 100% detection, 3 accurate propagation forecasts"}],
    ]

    consensus_per_step = [
        [], [], [], [], [],
        [{"event": "Collaborative SIGMET — Squall Line", "votes": {"MYGF": "AGREE", "MYAM": "AGREE", "MYAT": "AGREE"}, "result": "REACHED"}],
        [], [], [],
        [{"event": "SIGMET Cancellation — Squall Cleared", "votes": {"MYGF": "AGREE", "MYAM": "AGREE", "MYAT": "AGREE"}, "result": "REACHED"}],
    ]

    alerts_per_step = [
        [],
        [{"station": "MYGF", "type": "WATCH", "text": "Squall line detected approaching from NW — CB tops visible"}],
        [{"station": "MYGF", "type": "WARNING", "text": "Squall line impact — 45kt gusts, 1SM visibility, heavy rain"}],
        [],
        [{"station": "MYAM", "type": "WARNING", "text": "Squall line impact — 40kt gusts, 3/4SM visibility, IFR conditions"}],
        [{"station": "MYAM", "type": "SIGMET", "text": "Collaborative SIGMET: Squall line with embedded CB, tops FL380, MOV SE 30kt"}],
        [],
        [{"station": "MYAT", "type": "WARNING", "text": "Squall line impact — 42kt gusts, 1SM visibility, heavy rain"}],
        [],
        [{"station": "MYAM", "type": "ADVISORY", "text": "SIGMET canceled — squall line cleared all stations, VFR restored"}],
    ]

    propagation_per_step = [
        [],
        [{"from": "MYGF", "to": "MYAM", "phenomenon": "Squall line", "eta_min": 18},
         {"from": "MYGF", "to": "MYAT", "phenomenon": "Squall line", "eta_min": 35}],
        [{"from": "MYGF", "to": "MYAM", "phenomenon": "Squall line", "eta_min": 8}],
        [{"from": "MYGF", "to": "MYAM", "phenomenon": "Squall line", "eta_min": 2}],
        [{"from": "MYAM", "to": "MYAT", "phenomenon": "Squall line", "eta_min": 15}],
        [{"from": "MYAM", "to": "MYAT", "phenomenon": "Squall line", "eta_min": 8}],
        [{"from": "MYAM", "to": "MYAT", "phenomenon": "Squall line", "eta_min": 2}],
        [], [], [],
    ]

    s = min(step, total_steps - 1)
    return {
        "scenario_id": "squall_line",
        "scenario_name": "Squall Line Crossing Northern Bahamas",
        "step": s,
        "total_steps": total_steps,
        "elapsed_minutes": s * 10,
        "narration": narrations[s],
        "nodes": _all_nodes(**nodes_overrides[s]),
        "active_messages": messages_per_step[s],
        "consensus_votes": consensus_per_step[s],
        "alerts_issued": alerts_per_step[s],
        "propagation_forecasts": propagation_per_step[s],
    }


# ── Scenario 3: Sensor Fault at Nassau ───────────────────────────────────

def _sensor_fault(step):
    total_steps = 10
    narrations = [
        "T+0 min: All stations operating normally. MYNN (Nassau) reporting standard conditions — temperature 28.0°C, pressure 1013.2 hPa, wind 12 kt. Routine peer-to-peer observations flowing across the mesh.",
        "T+5 min: MYNN temperature sensor begins drifting — reporting 32.5°C while neighboring MYBC (Chub Cay) and MYCB (Andros) report 27.8°C and 28.1°C respectively. No weather system to explain the 4.5°C discrepancy.",
        "T+10 min: MYNN temperature spikes to 41.2°C — clearly erroneous. The station's local AI flags the reading as anomalous (confidence 0.12). MYNN sends an OBSERVATION with a low-confidence warning to neighbors.",
        "T+15 min: MYBC and MYCB receive MYNN's suspect readings. Both stations' local AI models perform cross-validation — their own sensors and nearby ocean temps confirm temperatures should be 27-29°C. Anomaly detected.",
        "T+20 min: MYBC initiates a consensus vote for sensor fault declaration. MYNN's temperature now reading -5.3°C — clearly a hardware malfunction. The sensor is oscillating wildly between extreme values.",
        "T+25 min: Consensus vote complete — MYBC: AGREE, MYCB: AGREE, MYNN: ABSTAIN (cannot self-validate). Sensor fault officially declared. MYNN's temperature data automatically flagged as UNRELIABLE across the network.",
        "T+30 min: Network compensation mode activated. MYBC and MYCB increase their reporting frequency from 5-min to 1-min intervals to cover Nassau's temperature gap. Interpolated temperature for Nassau calculated from neighbors.",
        "T+35 min: MYNN acknowledges fault and switches temperature reporting to 'interpolated' mode using neighbor data. All other MYNN sensors remain operational. Station continues all non-temperature functions normally.",
        "T+40 min: Maintenance alert dispatched via mesh network. MYNN's interpolated temperature (28.2°C based on MYBC/MYCB average) closely matches pre-fault readings. Network data quality maintained.",
        "T+45 min: Network health summary — fault detected in 10 minutes, isolated in 25 minutes, compensated in 30 minutes. Zero impact on aviation services. Demonstrates autonomous fault detection and network self-healing.",
    ]

    nodes_overrides = [
        # Step 0: Normal
        {},
        # Step 1: MYNN temp drifting
        {"MYNN": {"temperature_c": 32.5, "detection": "temp_anomaly_mild", "status": "caution", "alert_level": "advisory"}},
        # Step 2: MYNN temp spikes
        {"MYNN": {"temperature_c": 41.2, "detection": "temp_sensor_fault", "status": "degraded", "alert_level": "watch"}},
        # Step 3: Neighbors cross-validate
        {"MYNN": {"temperature_c": 38.7, "detection": "temp_sensor_fault", "status": "degraded", "alert_level": "watch"},
         "MYBC": {"detection": "cross_validation_anomaly", "alert_level": "advisory"},
         "MYCB": {"detection": "cross_validation_anomaly", "alert_level": "advisory"}},
        # Step 4: Consensus vote initiated, sensor oscillating
        {"MYNN": {"temperature_c": -5.3, "detection": "temp_sensor_malfunction", "status": "degraded", "alert_level": "warning"},
         "MYBC": {"detection": "consensus_vote_active", "alert_level": "advisory"},
         "MYCB": {"detection": "consensus_vote_active", "alert_level": "advisory"}},
        # Step 5: Fault declared
        {"MYNN": {"temperature_c": 55.0, "detection": "sensor_fault_confirmed", "status": "degraded", "alert_level": "warning"},
         "MYBC": {"detection": "fault_acknowledged", "alert_level": "advisory"},
         "MYCB": {"detection": "fault_acknowledged", "alert_level": "advisory"}},
        # Step 6: Compensation mode
        {"MYNN": {"temperature_c": 28.2, "detection": "interpolated_mode", "status": "caution", "alert_level": "advisory"},
         "MYBC": {"detection": "increased_reporting", "alert_level": "advisory"},
         "MYCB": {"detection": "increased_reporting", "alert_level": "advisory"}},
        # Step 7: MYNN interpolated
        {"MYNN": {"temperature_c": 28.2, "detection": "interpolated_mode", "status": "caution", "alert_level": "advisory"},
         "MYBC": {"detection": "increased_reporting"},
         "MYCB": {"detection": "increased_reporting"}},
        # Step 8: Maintenance dispatched
        {"MYNN": {"temperature_c": 28.2, "detection": "maintenance_dispatched", "status": "caution", "alert_level": "advisory"}},
        # Step 9: Summary
        {"MYNN": {"temperature_c": 28.2, "detection": "self_healed", "status": "caution", "alert_level": "advisory"}},
    ]

    messages_per_step = [
        [],
        [{"from": "MYNN", "to": "MYBC", "type": "OBSERVATION", "text": "T=32.5°C (flagged: +4.5°C above expected). Low confidence in reading."},
         {"from": "MYNN", "to": "MYCB", "type": "OBSERVATION", "text": "Temperature anomaly detected — sensor may be drifting"}],
        [{"from": "MYNN", "to": "MYBC", "type": "ALERT", "text": "TEMP SPIKE: 41.2°C — clearly erroneous. AI confidence: 0.12. Possible sensor fault."},
         {"from": "MYNN", "to": "MYCB", "type": "ALERT", "text": "Temperature sensor anomaly — requesting cross-validation from neighbors"}],
        [{"from": "MYBC", "to": "MYNN", "type": "INFERENCE", "text": "Cross-validation: Our temp 27.8°C, ocean SST 27.5°C. Your 38.7°C reading is anomalous."},
         {"from": "MYCB", "to": "MYNN", "type": "INFERENCE", "text": "Cross-validation: 28.1°C here. No weather pattern supports your reading. Sensor fault likely."}],
        [{"from": "MYBC", "to": "MYCB", "type": "VOTE", "text": "Initiating consensus vote: MYNN temperature sensor fault declaration"},
         {"from": "MYBC", "to": "MYNN", "type": "VOTE", "text": "Consensus vote initiated — MYNN temp sensor fault. Please submit your vote."}],
        [{"from": "MYBC", "to": "MYNN", "type": "VOTE", "text": "AGREE — MYNN temperature sensor confirmed faulty by cross-validation"},
         {"from": "MYCB", "to": "MYNN", "type": "VOTE", "text": "AGREE — independent cross-validation confirms sensor fault"},
         {"from": "MYNN", "to": "MYBC", "type": "VOTE", "text": "ABSTAIN — cannot self-validate faulty sensor"}],
        [{"from": "MYBC", "to": "MYNN", "type": "OBSERVATION", "text": "Increasing reporting frequency to 1-min intervals — compensating for your temp gap"},
         {"from": "MYCB", "to": "MYNN", "type": "OBSERVATION", "text": "1-min reporting active. Interpolated Nassau temp: 28.2°C based on neighbor average."}],
        [{"from": "MYNN", "to": "MYBC", "type": "OBSERVATION", "text": "Acknowledged — switching to interpolated temperature mode using neighbor data"},
         {"from": "MYNN", "to": "MYNN", "type": "ALERT", "text": "Temperature reporting: INTERPOLATED (28.2°C from MYBC/MYCB). All other sensors nominal."}],
        [{"from": "MYNN", "to": "MYBC", "type": "ALERT", "text": "Maintenance request dispatched — temperature sensor replacement required"},
         {"from": "MYBC", "to": "MYNN", "type": "OBSERVATION", "text": "Acknowledged. Will maintain increased reporting until repair complete."}],
        [{"from": "MYNN", "to": "MYBC", "type": "OBSERVATION", "text": "Network self-healing complete. Data quality maintained. Awaiting physical sensor repair."}],
    ]

    consensus_per_step = [
        [], [], [], [],
        [{"event": "Sensor Fault — MYNN Temperature", "votes": {"MYBC": "AGREE", "MYCB": "AGREE", "MYNN": "ABSTAIN"}, "result": "REACHED"}],
        [], [], [], [], [],
    ]

    alerts_per_step = [
        [], [],
        [{"station": "MYNN", "type": "ADVISORY", "text": "Temperature sensor anomaly — reading 41.2°C, AI confidence 0.12"}],
        [{"station": "MYBC", "type": "ADVISORY", "text": "Cross-validation: MYNN temperature data unreliable, 10°C above expected"}],
        [{"station": "MYBC", "type": "WATCH", "text": "Consensus vote in progress — MYNN temperature sensor fault declaration"}],
        [{"station": "MYNN", "type": "WARNING", "text": "SENSOR FAULT DECLARED — temperature data flagged UNRELIABLE network-wide"}],
        [{"station": "MYBC", "type": "ADVISORY", "text": "Compensation mode active — 1-min reporting covering Nassau temperature gap"}],
        [],
        [{"station": "MYNN", "type": "ADVISORY", "text": "Maintenance alert dispatched for temperature sensor replacement"}],
        [{"station": "MYNN", "type": "ADVISORY", "text": "Self-healing complete — fault detected 10min, isolated 25min, compensated 30min"}],
    ]

    propagation_per_step = [[], [], [], [], [], [], [], [], [], []]

    s = min(step, total_steps - 1)
    return {
        "scenario_id": "sensor_fault",
        "scenario_name": "Sensor Fault at Nassau (MYNN)",
        "step": s,
        "total_steps": total_steps,
        "elapsed_minutes": s * 5,
        "narration": narrations[s],
        "nodes": _all_nodes(**nodes_overrides[s]),
        "active_messages": messages_per_step[s],
        "consensus_votes": consensus_per_step[s],
        "alerts_issued": alerts_per_step[s],
        "propagation_forecasts": propagation_per_step[s],
    }


# ── Scenario 4: Total Hub Failure ────────────────────────────────────────

def _hub_failure(step):
    total_steps = 10
    narrations = [
        "T+0 min: All 15 stations connected to central hub. Normal operations — weather observations flowing, AI inferences being shared, consensus votes proceeding. Network health 100%.",
        "T+2 min: Hub connectivity begins degrading. Latency increasing from 50ms to 500ms. Stations MYNN and MYGF detect the degradation first. Heartbeat responses from hub becoming intermittent.",
        "T+5 min: HUB OFFLINE. All 15 stations simultaneously lose hub connectivity. Each station's watchdog timer triggers autonomous mode activation. Satellite uplinks engage as backup data path.",
        "T+7 min: All stations now in AUTONOMOUS MODE. Peer-to-peer mesh links remain fully operational. Stations continue exchanging observations, inferences, and heartbeats directly with neighbors.",
        "T+10 min: First autonomous consensus vote conducted without hub — MYNN initiates weather alert verification with MYBC and MYCB. Vote succeeds. Proves governance works without central authority.",
        "T+15 min: Stations self-organize into regional clusters. Northern cluster (MYGF, MYAM, MYAT) shares observations. Central cluster (MYNN, MYBC, MYCB, MYEM, MYER) coordinates. Southern cluster (MYEG, MYLD, MYES, MYRD, MYIG, MYMM) maintains coverage.",
        "T+20 min: MYAM detects a weather front and issues a local alert autonomously. Propagation forecast generated and sent to MYAT via mesh — exactly as it would work with hub. No degradation in weather detection capability.",
        "T+25 min: All stations reporting normally via satellite backup path. Data reaching external consumers through distributed routing. Message relay chains: MYIG→MYRD→MYEG→MYNN→satellite for southern stations.",
        "T+30 min: Hub connectivity restored. Stations detect hub heartbeat and begin reconnection sequence. Queued data synchronized — hub receives complete dataset, zero gaps during outage period.",
        "T+35 min: Full hub reconnection complete. All 15 stations back online. Post-mortem: 35 minutes of autonomous operation with zero data loss, zero missed alerts, zero service degradation. Mesh resilience validated.",
    ]

    def _hub_override(connected, autonomous):
        return {code: {"hub_connected": connected, "autonomous_mode": autonomous} for code in BAHAMAS_STATIONS}

    nodes_overrides = [
        # Step 0: All normal
        {},
        # Step 1: Degrading
        {"MYNN": {"detection": "hub_latency_high", "alert_level": "advisory", "status": "caution"},
         "MYGF": {"detection": "hub_latency_high", "alert_level": "advisory", "status": "caution"}},
        # Step 2: Hub offline — all stations autonomous
        {code: {"hub_connected": False, "autonomous_mode": True, "detection": "hub_lost", "alert_level": "watch", "status": "caution"} for code in BAHAMAS_STATIONS},
        # Step 3: Autonomous settled
        {code: {"hub_connected": False, "autonomous_mode": True, "detection": "autonomous_active", "alert_level": "advisory"} for code in BAHAMAS_STATIONS},
        # Step 4: First autonomous consensus
        {**{code: {"hub_connected": False, "autonomous_mode": True, "detection": "autonomous_active"} for code in BAHAMAS_STATIONS},
         "MYNN": {"hub_connected": False, "autonomous_mode": True, "detection": "consensus_initiated", "alert_level": "advisory"},
         "MYBC": {"hub_connected": False, "autonomous_mode": True, "detection": "consensus_vote", "alert_level": "advisory"},
         "MYCB": {"hub_connected": False, "autonomous_mode": True, "detection": "consensus_vote", "alert_level": "advisory"}},
        # Step 5: Regional clusters
        {**{code: {"hub_connected": False, "autonomous_mode": True, "detection": "cluster_member"} for code in BAHAMAS_STATIONS},
         "MYGF": {"hub_connected": False, "autonomous_mode": True, "detection": "cluster_lead_north"},
         "MYNN": {"hub_connected": False, "autonomous_mode": True, "detection": "cluster_lead_central"},
         "MYEG": {"hub_connected": False, "autonomous_mode": True, "detection": "cluster_lead_south"}},
        # Step 6: MYAM weather detection
        {**{code: {"hub_connected": False, "autonomous_mode": True, "detection": "autonomous_active"} for code in BAHAMAS_STATIONS},
         "MYAM": {"hub_connected": False, "autonomous_mode": True, "detection": "weather_front_detected", "alert_level": "watch", "pressure_hpa": 1009.0, "wind_kt": 25},
         "MYAT": {"hub_connected": False, "autonomous_mode": True, "detection": "propagation_warning", "alert_level": "advisory"}},
        # Step 7: Satellite relay
        {**{code: {"hub_connected": False, "autonomous_mode": True, "detection": "satellite_relay"} for code in BAHAMAS_STATIONS},
         "MYNN": {"hub_connected": False, "autonomous_mode": True, "detection": "relay_hub_node"},
         "MYIG": {"hub_connected": False, "autonomous_mode": True, "detection": "relay_chain_origin"},
         "MYRD": {"hub_connected": False, "autonomous_mode": True, "detection": "relay_chain_hop"},
         "MYEG": {"hub_connected": False, "autonomous_mode": True, "detection": "relay_chain_hop"}},
        # Step 8: Hub restoring
        {**{code: {"hub_connected": True, "autonomous_mode": False, "detection": "hub_reconnecting"} for code in BAHAMAS_STATIONS},
         "MYIG": {"hub_connected": False, "autonomous_mode": True, "detection": "hub_reconnecting"},
         "MYMM": {"hub_connected": False, "autonomous_mode": True, "detection": "hub_reconnecting"},
         "MYRD": {"hub_connected": False, "autonomous_mode": True, "detection": "hub_reconnecting"}},
        # Step 9: Fully restored
        {code: {"detection": "hub_restored"} for code in BAHAMAS_STATIONS},
    ]

    messages_per_step = [
        [],
        [{"from": "MYNN", "to": "MYGF", "type": "ALERT", "text": "Hub latency spiking — 500ms, possible degradation. Preparing autonomous mode."},
         {"from": "MYGF", "to": "MYNN", "type": "ALERT", "text": "Confirmed — hub heartbeat intermittent here too. Satellite standby."}],
        [{"from": "MYNN", "to": "MYBC", "type": "ALERT", "text": "HUB OFFLINE — switching to autonomous mode. Peer-to-peer mesh active."},
         {"from": "MYGF", "to": "MYAM", "type": "ALERT", "text": "Hub lost. All stations autonomous. Mesh links nominal."},
         {"from": "MYEG", "to": "MYLD", "type": "ALERT", "text": "Hub connectivity lost. Engaging satellite backup and mesh relay."}],
        [{"from": "MYNN", "to": "MYBC", "type": "OBSERVATION", "text": "Autonomous mode stable. All sensors nominal. Peer links at full capacity."},
         {"from": "MYGF", "to": "MYAM", "type": "OBSERVATION", "text": "Northern cluster: MYGF, MYAM, MYAT all autonomous and communicating."}],
        [{"from": "MYNN", "to": "MYBC", "type": "VOTE", "text": "Initiating autonomous consensus vote — weather alert verification test"},
         {"from": "MYBC", "to": "MYNN", "type": "VOTE", "text": "AGREE — autonomous consensus functioning normally"},
         {"from": "MYCB", "to": "MYNN", "type": "VOTE", "text": "AGREE — governance without hub confirmed operational"}],
        [{"from": "MYGF", "to": "MYAM", "type": "OBSERVATION", "text": "Northern cluster formed — MYGF lead. Shared observations active."},
         {"from": "MYNN", "to": "MYBC", "type": "OBSERVATION", "text": "Central cluster formed — MYNN lead. 5 stations coordinating."},
         {"from": "MYEG", "to": "MYLD", "type": "OBSERVATION", "text": "Southern cluster formed — MYEG lead. 6 stations in cluster."}],
        [{"from": "MYAM", "to": "MYAT", "type": "ALERT", "text": "Weather front detected — pressure dropping, wind shifting. Propagation ETA 20min."},
         {"from": "MYAM", "to": "MYGF", "type": "OBSERVATION", "text": "Autonomous weather detection working perfectly — no hub needed for forecasting."}],
        [{"from": "MYIG", "to": "MYRD", "type": "OBSERVATION", "text": "Relay chain: forwarding observation data northward via mesh"},
         {"from": "MYRD", "to": "MYEG", "type": "OBSERVATION", "text": "Relay hop 2: MYIG data forwarded, adding MYRD observations"},
         {"from": "MYEG", "to": "MYNN", "type": "OBSERVATION", "text": "Relay hop 3: southern cluster data compiled, forwarding to satellite uplink"}],
        [{"from": "MYNN", "to": "MYGF", "type": "ALERT", "text": "Hub heartbeat detected! Beginning reconnection and data sync."},
         {"from": "MYGF", "to": "MYAM", "type": "ALERT", "text": "Hub coming back online — prepare data queue synchronization."},
         {"from": "MYEG", "to": "MYLD", "type": "ALERT", "text": "Hub reconnection in progress — queued data uploading via satellite."}],
        [{"from": "MYNN", "to": "MYGF", "type": "OBSERVATION", "text": "Full reconnection complete. Zero data loss during 35min outage. Mesh resilience validated."},
         {"from": "MYGF", "to": "MYNN", "type": "OBSERVATION", "text": "Confirmed — northern cluster data synchronized. No gaps in record."}],
    ]

    consensus_per_step = [
        [], [], [], [],
        [{"event": "Autonomous Consensus Test — Weather Alert", "votes": {"MYNN": "AGREE", "MYBC": "AGREE", "MYCB": "AGREE"}, "result": "REACHED"}],
        [], [], [], [],
        [{"event": "Hub Restoration Verified", "votes": {"MYNN": "AGREE", "MYGF": "AGREE", "MYEG": "AGREE", "MYAM": "AGREE"}, "result": "REACHED"}],
    ]

    alerts_per_step = [
        [],
        [{"station": "MYNN", "type": "ADVISORY", "text": "Hub connectivity degrading — latency 500ms, heartbeat intermittent"}],
        [{"station": "MYNN", "type": "WARNING", "text": "HUB OFFLINE — all stations switching to autonomous mode"}],
        [{"station": "MYNN", "type": "ADVISORY", "text": "Autonomous mode stable — all 15 stations operating via mesh and satellite"}],
        [{"station": "MYNN", "type": "ADVISORY", "text": "First autonomous consensus vote successful — governance confirmed without hub"}],
        [{"station": "MYGF", "type": "ADVISORY", "text": "Regional clusters formed — northern, central, and southern groups coordinating"}],
        [{"station": "MYAM", "type": "WATCH", "text": "Weather front detected autonomously — propagation forecast issued to MYAT"}],
        [{"station": "MYIG", "type": "ADVISORY", "text": "Southern relay chain active — data routing MYIG→MYRD→MYEG→MYNN→satellite"}],
        [{"station": "MYNN", "type": "ADVISORY", "text": "Hub reconnection detected — data synchronization in progress"}],
        [{"station": "MYNN", "type": "ADVISORY", "text": "Hub fully restored — 35min autonomous, zero data loss, zero missed alerts"}],
    ]

    propagation_per_step = [
        [], [], [], [], [], [],
        [{"from": "MYAM", "to": "MYAT", "phenomenon": "Weather front", "eta_min": 20}],
        [], [], [],
    ]

    s = min(step, total_steps - 1)
    return {
        "scenario_id": "hub_failure",
        "scenario_name": "Total Hub Failure",
        "step": s,
        "total_steps": total_steps,
        "elapsed_minutes": [0, 2, 5, 7, 10, 15, 20, 25, 30, 35][s],
        "narration": narrations[s],
        "nodes": _all_nodes(**nodes_overrides[s]),
        "active_messages": messages_per_step[s],
        "consensus_votes": consensus_per_step[s],
        "alerts_issued": alerts_per_step[s],
        "propagation_forecasts": propagation_per_step[s],
    }


# ── Scenario 5: Multi-Station IFR Event ─────────────────────────────────

def _ifr_event(step):
    total_steps = 10
    narrations = [
        "T+0 min: Pre-dawn conditions across the central Bahamas. Light winds, high humidity (95%), and clear skies. Sea surface temperature warm — conditions favorable for radiation fog formation.",
        "T+15 min: MYEG (Exuma) reports visibility dropping — 5 SM in haze, ceiling lowering to 8000 ft. Moisture accumulating at low levels. Station's AI model predicts fog formation within 30 minutes.",
        "T+30 min: MYEG visibility now 2 SM, ceiling 1200 ft. MVFR conditions. MYEM (Governor's Harbour) beginning to report reduced visibility — 4 SM and falling. Fog patches forming over warm ocean waters.",
        "T+45 min: MYEG enters IFR — visibility 3/4 SM, ceiling 200 ft. Dense fog. MYEM now at 2 SM, 800 ft. MYER (Rock Sound) detecting moisture increase — visibility 6 SM and falling.",
        "T+60 min: Three stations now affected. MYEG: 1/2 SM, MYEM: 1 SM, MYER: 3 SM. MYEG initiates consensus vote for IFR advisory. Local AI confidence of widespread event: 0.88.",
        "T+75 min: Consensus vote: MYEG AGREE, MYEM AGREE, MYER AGREE. Widespread IFR confirmed across central Bahamas. Automated AIRMET IFR drafted and distributed to all stations without hub involvement.",
        "T+90 min: MYER now IFR — 3/4 SM, 300 ft ceiling. Fog expanding. MYLD (Long Island) reporting 4 SM. Four stations impacted. MYES (San Salvador) still VFR but humidity rising. Network provides continuous coverage area analysis.",
        "T+105 min: Maximum fog extent. MYEG: 1/4 SM, MYEM: 1/2 SM, MYER: 1/2 SM, MYLD: 2 SM. Consensus vote to upgrade AIRMET to SIGMET for dense fog. All affected stations AGREE.",
        "T+120 min: Sun rising — fog beginning to dissipate at MYEG. Visibility improving to 2 SM. MYEM and MYER still IFR. Network tracks the fog dissipation in real-time, station by station.",
        "T+150 min: Fog fully dissipated. All stations VFR. SIGMET canceled by consensus vote. Post-event: 4 stations affected over 2.5 hours, zero aviation incidents, continuous IFR tracking maintained throughout.",
    ]

    nodes_overrides = [
        # Step 0: Pre-dawn
        {},
        # Step 1: MYEG starting
        {"MYEG": {"visibility_sm": 5, "ceiling_ft": 8000, "detection": "visibility_decreasing", "alert_level": "advisory"}},
        # Step 2: MYEG MVFR, MYEM starting
        {"MYEG": {"visibility_sm": 2, "ceiling_ft": 1200, "detection": "mvfr_conditions", "alert_level": "watch", "status": "caution"},
         "MYEM": {"visibility_sm": 4, "ceiling_ft": 5000, "detection": "visibility_decreasing", "alert_level": "advisory"}},
        # Step 3: MYEG IFR, MYEM MVFR, MYER starting
        {"MYEG": {"visibility_sm": 0.75, "ceiling_ft": 200, "detection": "ifr_conditions", "alert_level": "warning", "status": "degraded"},
         "MYEM": {"visibility_sm": 2, "ceiling_ft": 800, "detection": "mvfr_conditions", "alert_level": "watch", "status": "caution"},
         "MYER": {"visibility_sm": 6, "ceiling_ft": 10000, "detection": "moisture_increasing", "alert_level": "advisory"}},
        # Step 4: Multi-station IFR
        {"MYEG": {"visibility_sm": 0.5, "ceiling_ft": 100, "detection": "ifr_dense_fog", "alert_level": "warning", "status": "degraded"},
         "MYEM": {"visibility_sm": 1, "ceiling_ft": 500, "detection": "ifr_conditions", "alert_level": "warning", "status": "caution"},
         "MYER": {"visibility_sm": 3, "ceiling_ft": 2000, "detection": "mvfr_conditions", "alert_level": "watch", "status": "caution"}},
        # Step 5: Consensus reached
        {"MYEG": {"visibility_sm": 0.5, "ceiling_ft": 100, "detection": "ifr_dense_fog", "alert_level": "warning", "status": "degraded"},
         "MYEM": {"visibility_sm": 0.75, "ceiling_ft": 400, "detection": "ifr_conditions", "alert_level": "warning", "status": "degraded"},
         "MYER": {"visibility_sm": 2, "ceiling_ft": 1000, "detection": "mvfr_conditions", "alert_level": "watch", "status": "caution"}},
        # Step 6: MYER IFR, MYLD starting
        {"MYEG": {"visibility_sm": 0.25, "ceiling_ft": 100, "detection": "lifr_conditions", "alert_level": "warning", "status": "degraded"},
         "MYEM": {"visibility_sm": 0.5, "ceiling_ft": 300, "detection": "ifr_dense_fog", "alert_level": "warning", "status": "degraded"},
         "MYER": {"visibility_sm": 0.75, "ceiling_ft": 300, "detection": "ifr_conditions", "alert_level": "warning", "status": "degraded"},
         "MYLD": {"visibility_sm": 4, "ceiling_ft": 4000, "detection": "visibility_decreasing", "alert_level": "advisory"},
         "MYES": {"visibility_sm": 8, "detection": "humidity_rising", "alert_level": "advisory"}},
        # Step 7: Maximum extent
        {"MYEG": {"visibility_sm": 0.25, "ceiling_ft": 50, "detection": "lifr_dense_fog", "alert_level": "emergency", "status": "degraded"},
         "MYEM": {"visibility_sm": 0.5, "ceiling_ft": 200, "detection": "ifr_dense_fog", "alert_level": "warning", "status": "degraded"},
         "MYER": {"visibility_sm": 0.5, "ceiling_ft": 200, "detection": "ifr_dense_fog", "alert_level": "warning", "status": "degraded"},
         "MYLD": {"visibility_sm": 2, "ceiling_ft": 1200, "detection": "mvfr_conditions", "alert_level": "watch", "status": "caution"}},
        # Step 8: Dissipating
        {"MYEG": {"visibility_sm": 2, "ceiling_ft": 1500, "detection": "fog_dissipating", "alert_level": "watch", "status": "caution"},
         "MYEM": {"visibility_sm": 0.75, "ceiling_ft": 300, "detection": "ifr_conditions", "alert_level": "warning", "status": "degraded"},
         "MYER": {"visibility_sm": 0.75, "ceiling_ft": 400, "detection": "ifr_conditions", "alert_level": "warning", "status": "degraded"},
         "MYLD": {"visibility_sm": 3, "ceiling_ft": 2500, "detection": "fog_dissipating", "alert_level": "watch"}},
        # Step 9: All clear
        {},
    ]

    messages_per_step = [
        [],
        [{"from": "MYEG", "to": "MYEM", "type": "OBSERVATION", "text": "Visibility dropping — 5SM in haze, ceiling 8000ft. AI predicts fog in 30min."},
         {"from": "MYEG", "to": "MYER", "type": "INFERENCE", "text": "Fog conditions developing — warm SST + light wind + high humidity. Monitor visibility."}],
        [{"from": "MYEG", "to": "MYEM", "type": "OBSERVATION", "text": "MVFR — 2SM, ceiling 1200ft. Fog forming rapidly."},
         {"from": "MYEM", "to": "MYEG", "type": "OBSERVATION", "text": "Confirming — visibility 4SM and falling here too. Fog patches over water."}],
        [{"from": "MYEG", "to": "MYNN", "type": "ALERT", "text": "IFR CONDITIONS — vis 3/4SM, ceiling 200ft. Dense fog. Central Bahamas affected."},
         {"from": "MYEM", "to": "MYNN", "type": "OBSERVATION", "text": "MVFR here — 2SM, 800ft. Following MYEG trend with ~15min delay."}],
        [{"from": "MYEG", "to": "MYEM", "type": "VOTE", "text": "Initiating consensus vote — widespread IFR advisory for central Bahamas"},
         {"from": "MYER", "to": "MYEG", "type": "OBSERVATION", "text": "3SM and falling — confirming regional trend. Support IFR advisory."}],
        [{"from": "MYEG", "to": "MYEM", "type": "VOTE", "text": "AGREE — IFR conditions confirmed here, vis 1/2SM"},
         {"from": "MYEM", "to": "MYEG", "type": "VOTE", "text": "AGREE — IFR at Governor's Harbour, vis 3/4SM"},
         {"from": "MYER", "to": "MYEG", "type": "VOTE", "text": "AGREE — MVFR and deteriorating, supports widespread advisory"}],
        [{"from": "MYEG", "to": "MYNN", "type": "ALERT", "text": "AIRMET IFR issued — central Bahamas, 4 stations affected, fog expanding"},
         {"from": "MYLD", "to": "MYEG", "type": "OBSERVATION", "text": "Fog reaching Long Island — 4SM and decreasing"},
         {"from": "MYER", "to": "MYEG", "type": "ALERT", "text": "Now IFR — 3/4SM, 300ft ceiling. Fog is dense and expanding."}],
        [{"from": "MYEG", "to": "MYNN", "type": "ALERT", "text": "Upgrading to SIGMET — dense fog, 4 stations IFR/LIFR, zero visibility at Exuma"},
         {"from": "MYEG", "to": "MYEM", "type": "VOTE", "text": "Consensus vote: upgrade AIRMET IFR to SIGMET Dense Fog"}],
        [{"from": "MYEG", "to": "MYNN", "type": "OBSERVATION", "text": "Sunrise — fog dissipating at Exuma, vis improving to 2SM"},
         {"from": "MYEM", "to": "MYNN", "type": "OBSERVATION", "text": "Still IFR here — 3/4SM. Fog persisting in sheltered areas."}],
        [{"from": "MYEG", "to": "MYNN", "type": "OBSERVATION", "text": "All stations VFR. SIGMET canceled. Zero incidents during 2.5hr fog event."},
         {"from": "MYEG", "to": "MYEM", "type": "VOTE", "text": "Consensus vote: cancel SIGMET Dense Fog — all stations VFR"}],
    ]

    consensus_per_step = [
        [], [], [], [], [],
        [{"event": "AIRMET IFR — Central Bahamas", "votes": {"MYEG": "AGREE", "MYEM": "AGREE", "MYER": "AGREE"}, "result": "REACHED"}],
        [],
        [{"event": "Upgrade to SIGMET Dense Fog", "votes": {"MYEG": "AGREE", "MYEM": "AGREE", "MYER": "AGREE", "MYLD": "AGREE"}, "result": "REACHED"}],
        [],
        [{"event": "SIGMET Cancellation — Fog Cleared", "votes": {"MYEG": "AGREE", "MYEM": "AGREE", "MYER": "AGREE", "MYLD": "AGREE"}, "result": "REACHED"}],
    ]

    alerts_per_step = [
        [],
        [{"station": "MYEG", "type": "ADVISORY", "text": "Visibility decreasing — 5SM in haze, fog forecast within 30 min"}],
        [{"station": "MYEG", "type": "WATCH", "text": "MVFR conditions — 2SM, ceiling 1200ft, fog forming"}],
        [{"station": "MYEG", "type": "WARNING", "text": "IFR — visibility 3/4SM, ceiling 200ft, dense fog"}],
        [],
        [{"station": "MYEG", "type": "SIGMET", "text": "AIRMET IFR — Central Bahamas: MYEG, MYEM, MYER — dense fog, vis below 1SM"}],
        [{"station": "MYER", "type": "WARNING", "text": "IFR conditions — 3/4SM, 300ft ceiling, dense fog"}],
        [{"station": "MYEG", "type": "SIGMET", "text": "SIGMET Dense Fog — Central Bahamas, 4 stations LIFR/IFR, vis near zero"}],
        [{"station": "MYEG", "type": "ADVISORY", "text": "Fog dissipating at Exuma — vis improving to 2SM with sunrise"}],
        [{"station": "MYEG", "type": "ADVISORY", "text": "All stations VFR — SIGMET canceled, fog event concluded after 2.5 hours"}],
    ]

    propagation_per_step = [
        [],
        [{"from": "MYEG", "to": "MYEM", "phenomenon": "Radiation fog", "eta_min": 30},
         {"from": "MYEG", "to": "MYER", "phenomenon": "Radiation fog", "eta_min": 45}],
        [{"from": "MYEG", "to": "MYEM", "phenomenon": "Fog bank", "eta_min": 15},
         {"from": "MYEG", "to": "MYER", "phenomenon": "Fog bank", "eta_min": 30}],
        [{"from": "MYEM", "to": "MYER", "phenomenon": "Dense fog", "eta_min": 15}],
        [],
        [],
        [{"from": "MYER", "to": "MYLD", "phenomenon": "Fog expansion", "eta_min": 20},
         {"from": "MYER", "to": "MYES", "phenomenon": "Fog expansion", "eta_min": 45}],
        [],
        [], [],
    ]

    s = min(step, total_steps - 1)
    return {
        "scenario_id": "ifr_event",
        "scenario_name": "Multi-Station IFR Event",
        "step": s,
        "total_steps": total_steps,
        "elapsed_minutes": s * 15,
        "narration": narrations[s],
        "nodes": _all_nodes(**nodes_overrides[s]),
        "active_messages": messages_per_step[s],
        "consensus_votes": consensus_per_step[s],
        "alerts_issued": alerts_per_step[s],
        "propagation_forecasts": propagation_per_step[s],
    }


# ── Scenario 6: Tropical Wave Detection ──────────────────────────────────

def _tropical_wave(step):
    total_steps = 10
    narrations = [
        "T+0 hr: Normal afternoon conditions across the Bahamas. Scattered cumulus, typical trade wind pattern. Nothing unusual in any single station's readings — but something subtle is about to unfold.",
        "T+1 hr: MYIG (Inagua) — southeastern-most station — records a barely perceptible pressure oscillation: 1012.8 → 1012.2 → 1012.6 hPa over 30 minutes. Within normal variance. Station AI flags it as 'interesting' but not actionable.",
        "T+2 hr: MYMM (Mayaguana) sees a similar pattern: 1012.5 → 1011.9 → 1012.3 hPa. The oscillation wavelength matches MYIG's pattern with a 45-minute offset. Two stations now showing correlated but individually insignificant signals.",
        "T+3 hr: MYES (San Salvador) joins the pattern — pressure oscillation 1012.4 → 1011.7 → 1012.1 hPa. Three stations in a line from SE to NW all showing the same signature. MYIG's AI calculates correlation coefficient: 0.87.",
        "T+4 hr: MYEG (Exuma) and MYLD (Long Island) now detecting the oscillation. Five stations showing the pattern. No single station can declare this a weather event — but MYIG initiates a cross-station correlation analysis via the mesh.",
        "T+5 hr: Mesh network correlation complete. Five-station analysis reveals a coherent tropical wave passage: wavelength ~300km, moving WNW at 15kt, pressure perturbation 0.6-0.8 hPa. No individual station could have detected this pattern.",
        "T+6 hr: Consensus vote initiated — MYIG proposes 'Tropical Wave Advisory' based on collective detection. All 5 affected stations AGREE. MYER and MYEM now detecting the leading edge of the oscillation.",
        "T+7 hr: Tropical Wave Advisory issued across the network. 7 stations now showing the signature. Wave approaching central Bahamas. Enhanced shower activity detected along the wave axis by MYEG and MYLD.",
        "T+8 hr: Wave passing through central Bahamas — MYNN, MYBC, MYCB now detecting the oscillation. Peak of enhanced convection over Exuma. Propagation forecasts sent to MYAM and MYGF with 3-4 hour ETAs.",
        "T+9 hr: Wave approaching northern Bahamas. 12 of 15 stations have now detected the passage. Collective tracking shows wave maintaining structure. Network has tracked the wave across 400nm — demonstrating distributed detection capability impossible for any single station.",
    ]

    def _wave_pressure(base, step_idx, station_delay):
        """Subtle pressure oscillation for tropical wave."""
        if step_idx <= station_delay:
            return base
        t = step_idx - station_delay
        return round(base - 0.6 * (1 if t % 2 == 1 else 0.3), 1)

    nodes_overrides = [
        # Step 0: Normal
        {},
        # Step 1: MYIG subtle detection
        {"MYIG": {"pressure_hpa": 1012.2, "detection": "pressure_oscillation", "alert_level": "advisory"}},
        # Step 2: MYMM joins
        {"MYIG": {"pressure_hpa": 1012.6, "detection": "pressure_oscillation"},
         "MYMM": {"pressure_hpa": 1011.9, "detection": "pressure_oscillation", "alert_level": "advisory"}},
        # Step 3: MYES joins, 3 stations
        {"MYIG": {"pressure_hpa": 1012.4, "detection": "wave_correlation_detected"},
         "MYMM": {"pressure_hpa": 1012.3, "detection": "pressure_oscillation"},
         "MYES": {"pressure_hpa": 1011.7, "detection": "pressure_oscillation", "alert_level": "advisory"}},
        # Step 4: MYEG, MYLD join, 5 stations
        {"MYIG": {"pressure_hpa": 1012.8, "detection": "wave_confirmed"},
         "MYMM": {"pressure_hpa": 1012.0, "detection": "wave_correlation_detected"},
         "MYES": {"pressure_hpa": 1012.1, "detection": "wave_correlation_detected"},
         "MYEG": {"pressure_hpa": 1012.0, "detection": "pressure_oscillation", "alert_level": "advisory"},
         "MYLD": {"pressure_hpa": 1012.1, "detection": "pressure_oscillation", "alert_level": "advisory"}},
        # Step 5: Correlation complete
        {"MYIG": {"pressure_hpa": 1013.0, "detection": "wave_passage_complete"},
         "MYMM": {"pressure_hpa": 1012.4, "detection": "wave_confirmed"},
         "MYES": {"pressure_hpa": 1011.8, "detection": "wave_confirmed"},
         "MYEG": {"pressure_hpa": 1011.6, "detection": "wave_correlation_detected", "alert_level": "advisory"},
         "MYLD": {"pressure_hpa": 1011.7, "detection": "wave_correlation_detected", "alert_level": "advisory"}},
        # Step 6: Consensus vote, MYER/MYEM detecting
        {"MYIG": {"pressure_hpa": 1013.2, "detection": "wave_passed"},
         "MYMM": {"pressure_hpa": 1012.8, "detection": "wave_passed"},
         "MYES": {"pressure_hpa": 1012.3, "detection": "wave_confirmed"},
         "MYEG": {"pressure_hpa": 1011.4, "detection": "wave_confirmed", "alert_level": "advisory", "status": "caution", "wind_kt": 18},
         "MYLD": {"pressure_hpa": 1011.5, "detection": "wave_confirmed", "alert_level": "advisory"},
         "MYER": {"pressure_hpa": 1012.2, "detection": "pressure_oscillation", "alert_level": "advisory"},
         "MYEM": {"pressure_hpa": 1012.3, "detection": "pressure_oscillation", "alert_level": "advisory"}},
        # Step 7: 7 stations, enhanced convection
        {"MYIG": {"pressure_hpa": 1013.2, "detection": "wave_passed"},
         "MYMM": {"pressure_hpa": 1013.0, "detection": "wave_passed"},
         "MYES": {"pressure_hpa": 1012.8, "detection": "wave_passed"},
         "MYEG": {"pressure_hpa": 1011.2, "detection": "enhanced_convection", "alert_level": "watch", "status": "caution", "wind_kt": 22, "visibility_sm": 5},
         "MYLD": {"pressure_hpa": 1011.3, "detection": "enhanced_convection", "alert_level": "advisory", "wind_kt": 18},
         "MYER": {"pressure_hpa": 1011.8, "detection": "wave_confirmed", "alert_level": "advisory"},
         "MYEM": {"pressure_hpa": 1011.9, "detection": "wave_confirmed", "alert_level": "advisory"}},
        # Step 8: Central Bahamas
        {"MYIG": {"pressure_hpa": 1013.2, "detection": "wave_passed"},
         "MYMM": {"pressure_hpa": 1013.0, "detection": "wave_passed"},
         "MYES": {"pressure_hpa": 1013.0, "detection": "wave_passed"},
         "MYEG": {"pressure_hpa": 1011.8, "detection": "wave_clearing", "alert_level": "advisory"},
         "MYLD": {"pressure_hpa": 1011.5, "detection": "wave_confirmed", "alert_level": "advisory"},
         "MYER": {"pressure_hpa": 1011.4, "detection": "wave_confirmed", "alert_level": "advisory"},
         "MYEM": {"pressure_hpa": 1011.5, "detection": "wave_confirmed", "alert_level": "advisory"},
         "MYNN": {"pressure_hpa": 1012.0, "detection": "pressure_oscillation", "alert_level": "advisory"},
         "MYBC": {"pressure_hpa": 1012.1, "detection": "pressure_oscillation", "alert_level": "advisory"},
         "MYCB": {"pressure_hpa": 1012.0, "detection": "pressure_oscillation", "alert_level": "advisory"}},
        # Step 9: Northern approach
        {"MYIG": {"pressure_hpa": 1013.2, "detection": "wave_passed"},
         "MYMM": {"pressure_hpa": 1013.0, "detection": "wave_passed"},
         "MYES": {"pressure_hpa": 1013.0, "detection": "wave_passed"},
         "MYEG": {"pressure_hpa": 1012.8, "detection": "wave_passed"},
         "MYLD": {"pressure_hpa": 1012.5, "detection": "wave_passed"},
         "MYER": {"pressure_hpa": 1012.0, "detection": "wave_clearing"},
         "MYEM": {"pressure_hpa": 1012.0, "detection": "wave_clearing"},
         "MYNN": {"pressure_hpa": 1011.6, "detection": "wave_confirmed", "alert_level": "advisory"},
         "MYBC": {"pressure_hpa": 1011.7, "detection": "wave_confirmed", "alert_level": "advisory"},
         "MYCB": {"pressure_hpa": 1011.8, "detection": "wave_confirmed", "alert_level": "advisory"},
         "MYBS": {"pressure_hpa": 1012.2, "detection": "pressure_oscillation", "alert_level": "advisory"},
         "MYAM": {"pressure_hpa": 1012.1, "detection": "pressure_oscillation", "alert_level": "advisory"}},
    ]

    messages_per_step = [
        [],
        [{"from": "MYIG", "to": "MYMM", "type": "OBSERVATION", "text": "Subtle pressure oscillation detected: 1012.8→1012.2→1012.6 over 30min. AI flags as interesting."}],
        [{"from": "MYMM", "to": "MYIG", "type": "OBSERVATION", "text": "Similar oscillation here — 1012.5→1011.9→1012.3. 45-min offset from your pattern."},
         {"from": "MYIG", "to": "MYMM", "type": "INFERENCE", "text": "Correlated oscillation between our stations. Possible tropical wave signature."}],
        [{"from": "MYES", "to": "MYIG", "type": "OBSERVATION", "text": "Pressure oscillation detected: 1012.4→1011.7→1012.1. Matches your reported pattern."},
         {"from": "MYIG", "to": "MYES", "type": "INFERENCE", "text": "Three-station correlation detected. Computing wave parameters."}],
        [{"from": "MYEG", "to": "MYIG", "type": "OBSERVATION", "text": "Pressure oscillation beginning here — 1012.0 and fluctuating"},
         {"from": "MYLD", "to": "MYIG", "type": "OBSERVATION", "text": "Confirming oscillation pattern at Long Island"},
         {"from": "MYIG", "to": "MYEG", "type": "INFERENCE", "text": "Initiating 5-station cross-correlation analysis via mesh network"}],
        [{"from": "MYIG", "to": "MYNN", "type": "INFERENCE", "text": "TROPICAL WAVE DETECTED — 5-station correlation: wavelength 300km, WNW at 15kt, 0.6-0.8hPa perturbation"},
         {"from": "MYIG", "to": "MYEG", "type": "INFERENCE", "text": "No single station could detect this — collective mesh analysis identified coherent wave pattern"}],
        [{"from": "MYIG", "to": "MYES", "type": "VOTE", "text": "Proposing Tropical Wave Advisory — consensus vote initiated"},
         {"from": "MYES", "to": "MYIG", "type": "VOTE", "text": "AGREE — oscillation pattern confirmed at San Salvador"},
         {"from": "MYER", "to": "MYIG", "type": "OBSERVATION", "text": "Leading edge of oscillation detected at Rock Sound — wave approaching"}],
        [{"from": "MYIG", "to": "MYNN", "type": "ALERT", "text": "Tropical Wave Advisory issued — 7 stations tracking, enhanced convection along wave axis"},
         {"from": "MYEG", "to": "MYNN", "type": "OBSERVATION", "text": "Enhanced shower activity along wave axis — cumulus building rapidly"}],
        [{"from": "MYNN", "to": "MYIG", "type": "OBSERVATION", "text": "Oscillation detected at Nassau — wave entering central Bahamas"},
         {"from": "MYEG", "to": "MYAM", "type": "INFERENCE", "text": "Propagation forecast: tropical wave ETA your station 3-4 hours"},
         {"from": "MYEG", "to": "MYGF", "type": "INFERENCE", "text": "Propagation forecast: tropical wave ETA Freeport ~4 hours"}],
        [{"from": "MYNN", "to": "MYGF", "type": "OBSERVATION", "text": "12 of 15 stations have tracked this wave. Collective detection across 400nm demonstrated."},
         {"from": "MYAM", "to": "MYNN", "type": "OBSERVATION", "text": "Oscillation beginning here — wave reaching northern Bahamas on schedule"},
         {"from": "MYIG", "to": "MYNN", "type": "INFERENCE", "text": "Wave maintaining coherent structure throughout transit. Distributed detection validated."}],
    ]

    consensus_per_step = [
        [], [], [], [], [], [],
        [{"event": "Tropical Wave Advisory", "votes": {"MYIG": "AGREE", "MYMM": "AGREE", "MYES": "AGREE", "MYEG": "AGREE", "MYLD": "AGREE"}, "result": "REACHED"}],
        [], [], [],
    ]

    alerts_per_step = [
        [], [],
        [{"station": "MYIG", "type": "ADVISORY", "text": "Correlated pressure oscillation detected at 2 stations — monitoring for tropical wave"}],
        [{"station": "MYIG", "type": "ADVISORY", "text": "Three-station pressure oscillation correlation confirmed — wave analysis in progress"}],
        [{"station": "MYIG", "type": "ADVISORY", "text": "Five stations showing correlated oscillation — initiating mesh-wide correlation analysis"}],
        [{"station": "MYIG", "type": "WATCH", "text": "TROPICAL WAVE IDENTIFIED — 5-station collective detection, 300km wavelength, moving WNW 15kt"}],
        [],
        [{"station": "MYIG", "type": "ADVISORY", "text": "Tropical Wave Advisory — enhanced convection along wave axis, affecting central Bahamas"}],
        [{"station": "MYNN", "type": "ADVISORY", "text": "Tropical wave entering central Bahamas — 10 stations now tracking"}],
        [{"station": "MYIG", "type": "ADVISORY", "text": "Tropical wave tracked across 400nm by 12 stations — distributed detection capability demonstrated"}],
    ]

    propagation_per_step = [
        [], [],
        [{"from": "MYIG", "to": "MYES", "phenomenon": "Tropical wave", "eta_min": 60}],
        [{"from": "MYMM", "to": "MYEG", "phenomenon": "Tropical wave", "eta_min": 90}],
        [{"from": "MYES", "to": "MYER", "phenomenon": "Tropical wave", "eta_min": 60}],
        [{"from": "MYEG", "to": "MYEM", "phenomenon": "Tropical wave", "eta_min": 60}],
        [{"from": "MYEG", "to": "MYNN", "phenomenon": "Tropical wave", "eta_min": 120}],
        [{"from": "MYER", "to": "MYNN", "phenomenon": "Tropical wave", "eta_min": 60}],
        [{"from": "MYNN", "to": "MYAM", "phenomenon": "Tropical wave", "eta_min": 180},
         {"from": "MYNN", "to": "MYGF", "phenomenon": "Tropical wave", "eta_min": 240}],
        [{"from": "MYAM", "to": "MYGF", "phenomenon": "Tropical wave", "eta_min": 60}],
    ]

    s = min(step, total_steps - 1)
    return {
        "scenario_id": "tropical_wave",
        "scenario_name": "Tropical Wave Detection",
        "step": s,
        "total_steps": total_steps,
        "elapsed_minutes": s * 60,
        "narration": narrations[s],
        "nodes": _all_nodes(**nodes_overrides[s]),
        "active_messages": messages_per_step[s],
        "consensus_votes": consensus_per_step[s],
        "alerts_issued": alerts_per_step[s],
        "propagation_forecasts": propagation_per_step[s],
    }


# ── Scenario Dispatcher ─────────────────────────────────────────────────

_SCENARIO_FUNCS = {
    "hurricane_landfall": _hurricane_landfall,
    "squall_line": _squall_line,
    "sensor_fault": _sensor_fault,
    "hub_failure": _hub_failure,
    "ifr_event": _ifr_event,
    "tropical_wave": _tropical_wave,
}


def run_scenario(scenario_id: str, step: int) -> dict:
    """Run a scenario at the given step. Returns full state."""
    func = _SCENARIO_FUNCS.get(scenario_id)
    if not func:
        return {"error": f"Unknown scenario: {scenario_id}"}
    return func(step)
