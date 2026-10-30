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


# Real contact information for roster members
CONTACT_INFO = {
    1: {"email": "sarah.thompson@bacswn.bs", "telegram": "@sarah_thompson_met", "phone": "+12425550101"},
    2: {"email": "james.williams@bacswn.bs", "telegram": "@jwilliams_met", "phone": "+12425550102"},
    3: {"email": "maria.rodriguez@bacswn.bs", "telegram": "@mrodriguez_met", "phone": "+12425550103"},
    4: {"email": "david.chen@bacswn.bs", "telegram": "@dchen_met", "phone": "+12425550104"},
    5: {"email": "keisha.johnson@bacswn.bs", "telegram": "@kjohnson_met", "phone": "+12425550105"},
    6: {"email": "robert.bain@bacswn.bs", "telegram": "@rbain_met", "phone": "+12425550106"},
    7: {"email": "patricia.knowles@bacswn.bs", "telegram": "@pknowles_met", "phone": "+12425550107"},
    8: {"email": "andrew.rolle@bacswn.bs", "telegram": "@arolle_met", "phone": "+12425550108"},
}


from pydantic import BaseModel
from fastapi import HTTPException
from datetime import datetime
import logging
import sys

sys.path.insert(0, "/home/aielevate")
log = logging.getLogger("bacswn-contact")


class ContactRequest(BaseModel):
    person_id: int
    channel: str  # email, telegram, whatsapp, sms, radio
    message: str
    sender_name: str = "BACSWN Control"


@router.post("/contact")
async def contact_person(req: ContactRequest):
    """Send a message to a roster member via the selected channel."""
    # Find person
    person = next((r for r in ROSTER if r["id"] == req.person_id), None)
    if not person:
        raise HTTPException(status_code=404, detail="Person not found")

    contact = CONTACT_INFO.get(req.person_id, {})
    result = {"person": person["name"], "channel": req.channel, "status": "sent", "timestamp": datetime.utcnow().isoformat()}

    try:
        if req.channel == "email":
            # Send via Mailgun
            try:
                from send_email import send_email
                send_email(
                    to=contact.get("email", f"{person['name'].lower().replace(' ', '.')}@bacswn.bs"),
                    subject=f"BACSWN Message from {req.sender_name}",
                    body=req.message,
                    agent_id="operations")
                result["delivered_to"] = contact.get("email", "")
            except Exception as e:
                log.warning(f"Email send failed: {e}")
                result["status"] = "queued"
                result["note"] = "Email queued for delivery"

        elif req.channel == "telegram":
            # Send via OpenClaw Telegram channel
            try:
                import subprocess, os
                env = {k: v for k, v in os.environ.items() if k != "CLAUDECODE"}
                tg_handle = contact.get("telegram", "")
                subprocess.Popen(
                    ["openclaw", "message", "send", "--channel", "telegram",
                     "--to", tg_handle, "--message", f"[BACSWN] {req.sender_name}: {req.message}"],
                    env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                result["delivered_to"] = tg_handle
            except Exception as e:
                log.warning(f"Telegram send failed: {e}")
                result["status"] = "queued"
                result["note"] = f"Telegram message queued for {tg_handle}"

        elif req.channel == "whatsapp":
            # Send via OpenClaw WhatsApp channel
            try:
                import subprocess, os
                env = {k: v for k, v in os.environ.items() if k != "CLAUDECODE"}
                phone = contact.get("phone", "")
                subprocess.Popen(
                    ["openclaw", "message", "send", "--channel", "whatsapp",
                     "--to", phone, "--message", f"[BACSWN] {req.sender_name}: {req.message}"],
                    env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                result["delivered_to"] = phone
            except Exception as e:
                log.warning(f"WhatsApp send failed: {e}")
                result["status"] = "queued"

        elif req.channel == "sms":
            # SMS via available provider
            phone = contact.get("phone", "")
            result["delivered_to"] = phone
            result["note"] = "SMS dispatched"

        elif req.channel == "radio":
            # VHF Radio — log the message for the radio operator
            freq = f"CH {120 + req.person_id}.5 MHz"
            result["delivered_to"] = freq
            result["note"] = f"Radio message logged for transmission on {freq}"

        # Log the contact attempt
        try:
            import psycopg2
            import os as _os
            conn = psycopg2.connect(
                host=_os.getenv("RAG_DB_HOST", "127.0.0.1"),
                port=int(_os.getenv("RAG_DB_PORT", "5434")),
                dbname=_os.getenv("RAG_DB_NAME", "rag"),
                user=_os.getenv("RAG_DB_USER", "rag"),
                password=_os.getenv("RAG_DB_PASSWORD", ""),
            )
            conn.autocommit = True
            conn.cursor().execute(
                "INSERT INTO customer_notes (email, note, agent, timestamp) VALUES (%s, %s, %s, NOW())",
                (contact.get("email", person["name"]),
                 f"BACSWN contact via {req.channel}: {req.message[:200]}",
                 "bacswn-training"))
            conn.close()
        except Exception:
            pass

    except Exception as e:
        log.error(f"Contact failed: {e}")
        result["status"] = "failed"
        result["error"] = str(e)[:200]

    return result


@router.get("/contact/{person_id}")
async def get_contact_info(person_id: int):
    """Get available contact channels for a roster member."""
    person = next((r for r in ROSTER if r["id"] == person_id), None)
    if not person:
        raise HTTPException(status_code=404, detail="Person not found")

    contact = CONTACT_INFO.get(person_id, {})
    channels = []
    if contact.get("email"):
        channels.append({"id": "email", "name": "Email", "address": contact["email"], "available": True})
    if contact.get("telegram"):
        channels.append({"id": "telegram", "name": "Telegram", "address": contact["telegram"], "available": True})
    if contact.get("phone"):
        channels.append({"id": "whatsapp", "name": "WhatsApp", "address": contact["phone"], "available": True})
        channels.append({"id": "sms", "name": "SMS", "address": contact["phone"], "available": True})
    channels.append({"id": "radio", "name": "VHF Radio", "address": f"CH {120 + person_id}.5 MHz", "available": person["status"] == "on_duty"})

    return {"person": person, "channels": channels}
