"""BACSWN — Aviation weather chat API router (RAG-style)."""

from fastapi import APIRouter
from pydantic import BaseModel
from services.awc_client import fetch_metars, fetch_tafs, parse_metar
from services.opensky_client import fetch_flights
from config import STATION_COORDS

router = APIRouter()


class ChatMessage(BaseModel):
    message: str


@router.post("/")
async def chat(msg: ChatMessage):
    """Aviation weather briefing chat — answers pilot queries with live data."""
    query = msg.message.upper()

    # Detect station queries
    station_match = None
    for code in STATION_COORDS:
        if code in query:
            station_match = code
            break

    if station_match:
        metars = await fetch_metars([station_match])
        tafs = await fetch_tafs([station_match])
        parsed = [parse_metar(m) for m in metars]
        station_info = STATION_COORDS[station_match]

        metar_text = parsed[0]["raw_text"] if parsed else "No METAR available"
        taf_text = tafs[0].get("rawTAF", "No TAF available") if tafs else "No TAF available"
        cat = parsed[0].get("flight_category", "N/A") if parsed else "N/A"
        temp = parsed[0].get("temp_c", "N/A") if parsed else "N/A"
        wind = parsed[0].get("wind_speed_kt", "N/A") if parsed else "N/A"

        response = (
            f"**{station_info['name']} ({station_match})**\n\n"
            f"**Flight Category:** {cat}\n\n"
            f"**Current METAR:**\n`{metar_text}`\n\n"
            f"**Temperature:** {temp}°C | **Wind:** {wind} kt\n\n"
            f"**TAF:**\n`{taf_text}`\n\n"
            f"*Data from Aviation Weather Center (aviationweather.gov)*"
        )
        return {"response": response, "station": station_match, "type": "briefing"}

    # Flight queries
    if any(w in query for w in ["FLIGHT", "TRAFFIC", "AIRCRAFT", "AIRSPACE"]):
        flights = await fetch_flights()
        response = (
            f"**Bahamas FIR Traffic Summary**\n\n"
            f"Currently tracking **{len(flights)}** aircraft in Bahamas airspace.\n\n"
            f"**Airborne:** {len([f for f in flights if not f.get('on_ground')])}\n"
            f"**On Ground:** {len([f for f in flights if f.get('on_ground')])}\n\n"
        )
        if flights[:5]:
            response += "**Recent Flights:**\n"
            for f in flights[:5]:
                cs = f.get("callsign") or "N/A"
                alt = f.get("baro_altitude")
                alt_str = f"{alt:.0f}ft" if alt else "GND"
                response += f"- {cs} | {f.get('origin_country', '?')} | {alt_str}\n"

        return {"response": response, "type": "traffic"}

    # General help
    response = (
        "**BACSWN Aviation Weather Briefing**\n\n"
        "Ask me about:\n"
        "- **Station weather:** \"What's the weather at MYNN?\"\n"
        "- **Traffic:** \"How many flights are in the airspace?\"\n"
        "- **Station codes:** MYNN (Nassau), MYGF (Freeport), MYEG (Exuma), MYAM (Marsh Harbour)\n\n"
        "I provide real-time data from Aviation Weather Center and OpenSky Network."
    )
    return {"response": response, "type": "help"}
