"""BACSWN — AI-powered SIGMET/AIRMET advisory generator."""

import logging
from datetime import datetime, timedelta, timezone

logger = logging.getLogger("bacswn.sigmet")

# ICAO SIGMET hazard types
HAZARD_TYPES = {
    "TS": "Thunderstorm",
    "TURB": "Turbulence",
    "ICE": "Icing",
    "MTW": "Mountain Wave",
    "DS": "Dust Storm",
    "SS": "Sand Storm",
    "VA": "Volcanic Ash",
    "TC": "Tropical Cyclone",
    "CB": "Cumulonimbus",
    "LLWS": "Low Level Wind Shear",
}


def generate_sigmet(
    hazard_type: str,
    description: str,
    severity: str = "moderate",
    area: str = "MYNN FIR",
    fl_base: int = 0,
    fl_top: int = 450,
    movement: str = "STNR",
    valid_hours: int = 6,
) -> dict:
    """Generate an ICAO-formatted SIGMET advisory.

    Returns both raw ICAO text and structured data.
    """
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(hours=valid_hours)
    valid_from = now.strftime("%d%H%M")
    valid_to = expires_at.strftime("%d%H%M")   # handles day rollover correctly
    seq = now.strftime("%H%M")

    hazard_code = hazard_type.upper()
    hazard_name = HAZARD_TYPES.get(hazard_code, hazard_code)

    sev_map = {"light": "LGT", "moderate": "MOD", "severe": "SEV", "extreme": "EXTM"}
    sev_code = sev_map.get(severity.lower(), "MOD")

    # Build ICAO SIGMET text
    raw_text = (
        f"MYNN SIGMET {seq} VALID {valid_from}/{valid_to} MYNN-\n"
        f"MYNN NASSAU FIR {hazard_code} {sev_code}\n"
        f"OBS AT {now.strftime('%H%MZ')} {description.upper()}\n"
        f"FL{fl_base:03d}/{fl_top:03d}\n"
        f"MOV {movement}\n"
        f"INTSF/NC"
    )

    return {
        "advisory_type": "SIGMET",
        "hazard_type": hazard_code,
        "hazard_name": hazard_name,
        "severity": severity,
        "severity_code": sev_code,
        "raw_text": raw_text,
        "area": area,
        "fl_base": fl_base,
        "fl_top": fl_top,
        "movement": movement,
        "valid_from": now.isoformat(),
        "valid_to": expires_at.isoformat(),
        "valid_hours": valid_hours,
        "description": description,
        "generated_by": "bacswn-sigmet-drafter",
        "status": "draft",
    }
