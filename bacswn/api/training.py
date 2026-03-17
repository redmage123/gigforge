"""BACSWN — Training & certification API router."""

from fastapi import APIRouter

router = APIRouter()

# Demo meteorologist roster
ROSTER = [
    {"id": 1, "name": "Dr. Sarah Thompson", "title": "Senior Meteorologist", "certifications": ["WMO Class I", "ICAO Met Observer", "Radar Specialist"], "status": "on_duty", "station": "MYNN", "years_exp": 15, "next_renewal": "2026-09-15"},
    {"id": 2, "name": "James Williams", "title": "Aviation Meteorologist", "certifications": ["WMO Class II", "ICAO Met Observer"], "status": "on_duty", "station": "MYGF", "years_exp": 8, "next_renewal": "2026-06-01"},
    {"id": 3, "name": "Maria Rodriguez", "title": "Forecaster", "certifications": ["WMO Class II", "Tropical Cyclone Specialist"], "status": "off_duty", "station": "MYNN", "years_exp": 12, "next_renewal": "2026-11-30"},
    {"id": 4, "name": "David Chen", "title": "Marine Meteorologist", "certifications": ["WMO Class I", "Marine Forecast Specialist", "ICAO Met Observer"], "status": "on_duty", "station": "MYNN", "years_exp": 20, "next_renewal": "2027-01-15"},
    {"id": 5, "name": "Keisha Johnson", "title": "Radar Technician", "certifications": ["Doppler Radar Operator", "NEXRAD Maintenance"], "status": "on_duty", "station": "MYNN", "years_exp": 6, "next_renewal": "2026-04-01"},
    {"id": 6, "name": "Robert Bain", "title": "Climate Analyst", "certifications": ["WMO Class II", "Climate Data Management"], "status": "off_duty", "station": "MYNN", "years_exp": 10, "next_renewal": "2026-08-20"},
    {"id": 7, "name": "Patricia Knowles", "title": "Observer", "certifications": ["ICAO Met Observer"], "status": "on_duty", "station": "MYEG", "years_exp": 3, "next_renewal": "2026-12-01"},
    {"id": 8, "name": "Andrew Rolle", "title": "Shift Supervisor", "certifications": ["WMO Class I", "ICAO Met Observer", "Severe Weather Specialist"], "status": "on_duty", "station": "MYNN", "years_exp": 18, "next_renewal": "2026-07-10"},
]

TRAINING_MODULES = [
    {"id": 1, "title": "METAR/SPECI Encoding & Decoding", "category": "Observation", "duration_hrs": 4, "level": "Basic", "completion_rate": 92},
    {"id": 2, "title": "TAF Preparation & Verification", "category": "Forecasting", "duration_hrs": 8, "level": "Intermediate", "completion_rate": 88},
    {"id": 3, "title": "SIGMET Drafting (ICAO Format)", "category": "Advisories", "duration_hrs": 6, "level": "Advanced", "completion_rate": 75},
    {"id": 4, "title": "Tropical Cyclone Analysis", "category": "Severe Weather", "duration_hrs": 12, "level": "Advanced", "completion_rate": 70},
    {"id": 5, "title": "Radar Interpretation", "category": "Remote Sensing", "duration_hrs": 8, "level": "Intermediate", "completion_rate": 85},
    {"id": 6, "title": "Aviation Weather Hazards", "category": "Aviation", "duration_hrs": 6, "level": "Basic", "completion_rate": 95},
    {"id": 7, "title": "Climate Data QC Procedures", "category": "Quality Control", "duration_hrs": 4, "level": "Intermediate", "completion_rate": 80},
    {"id": 8, "title": "BACSWN AI Systems Operation", "category": "Technology", "duration_hrs": 8, "level": "Advanced", "completion_rate": 65},
]


@router.get("/roster")
async def get_roster():
    """Get meteorologist roster."""
    on_duty = sum(1 for r in ROSTER if r["status"] == "on_duty")
    return {"roster": ROSTER, "total": len(ROSTER), "on_duty": on_duty}


@router.get("/modules")
async def get_training_modules():
    """Get available training modules."""
    return {"modules": TRAINING_MODULES, "total": len(TRAINING_MODULES)}


@router.get("/certifications")
async def get_certification_summary():
    """Get certification tracking summary."""
    all_certs = set()
    for person in ROSTER:
        for cert in person["certifications"]:
            all_certs.add(cert)

    expiring_soon = [r for r in ROSTER if r["next_renewal"] < "2026-06-01"]

    return {
        "unique_certifications": len(all_certs),
        "total_staff": len(ROSTER),
        "expiring_within_90_days": len(expiring_soon),
        "expiring_soon": expiring_soon,
        "certification_types": sorted(all_certs),
    }
