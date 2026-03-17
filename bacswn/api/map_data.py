"""BACSWN — Map data API router (Command Center)."""

from fastapi import APIRouter
from services.opensky_client import fetch_flights
from services.awc_client import fetch_metars, parse_metar, fetch_sigmets
from services.nws_client import fetch_alerts
from services.hurricane_client import fetch_hurricanes
from config import STATION_COORDS, BAHAMAS_FIR_POLYGON, BAHAMAS_BBOX

router = APIRouter()


@router.get("/layers")
async def get_map_layers():
    """Get all map layer data for Command Center."""
    flights = await fetch_flights()
    metars = await fetch_metars()
    sigmets = await fetch_sigmets()
    alerts = await fetch_alerts()
    hurricanes = await fetch_hurricanes()

    # Build station markers with current weather
    metar_map = {parse_metar(m)["station_id"]: parse_metar(m) for m in metars}
    station_markers = []
    for code, info in STATION_COORDS.items():
        obs = metar_map.get(code, {})
        station_markers.append({
            "type": "station",
            "icao": code,
            "name": info["name"],
            "lat": info["lat"],
            "lon": info["lon"],
            "elevation_ft": info.get("elevation_ft", 0),
            "flight_category": obs.get("flight_category", "N/A"),
            "temp_c": obs.get("temp_c"),
            "dewpoint_c": obs.get("dewpoint_c"),
            "wind_dir_deg": obs.get("wind_dir_deg"),
            "wind_speed_kt": obs.get("wind_speed_kt"),
            "wind_gust_kt": obs.get("wind_gust_kt"),
            "visibility_sm": obs.get("visibility_sm"),
            "altimeter_inhg": obs.get("altimeter_inhg"),
            "wx_string": obs.get("wx_string", ""),
            "cloud_layers": obs.get("cloud_layers", ""),
            "raw_metar": obs.get("raw_text", ""),
        })

    # Build flight markers
    flight_markers = [{
        "type": "aircraft",
        "icao24": f["icao24"],
        "callsign": f["callsign"],
        "lat": f["latitude"],
        "lon": f["longitude"],
        "altitude": f["baro_altitude"],
        "velocity": f["velocity"],
        "track": f["true_track"],
        "vertical_rate": f["vertical_rate"],
        "on_ground": f["on_ground"],
        "origin_country": f["origin_country"],
        "category": f.get("category", "unknown"),
    } for f in flights if f.get("latitude") and f.get("longitude")]

    return {
        "flights": flight_markers,
        "stations": station_markers,
        "sigmets": sigmets[:10],
        "alerts": alerts[:10],
        "hurricanes": hurricanes,
        "fir_polygon": BAHAMAS_FIR_POLYGON,
        "bbox": BAHAMAS_BBOX,
        "flight_count": len(flight_markers),
        "station_count": len(station_markers),
    }
