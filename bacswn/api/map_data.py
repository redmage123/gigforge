"""BACSWN — Map data API router (Command Center)."""

from fastapi import APIRouter
from services.opensky_client import fetch_flights
from services.awc_client import fetch_metars, parse_metar, fetch_sigmets
from services.nws_client import fetch_alerts
from services.hurricane_client import fetch_hurricanes
from services.openmeteo_client import fetch_current_for_stations
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

    # Build station markers with current weather. Stations with a real METAR are
    # marked source="metar" (observed); the rest are filled from Open-Meteo
    # current conditions and marked source="model" (nowcast estimate) so the UI
    # can label them honestly and never present an estimate as an observation.
    metar_map = {parse_metar(m)["station_id"]: parse_metar(m) for m in metars}
    missing = [(code, info["lat"], info["lon"])
               for code, info in STATION_COORDS.items() if code not in metar_map]
    model_map = await fetch_current_for_stations(missing)

    station_markers = []
    for code, info in STATION_COORDS.items():
        obs = metar_map.get(code)
        if obs:
            station_markers.append({
                "type": "station", "icao": code, "name": info["name"],
                "lat": info["lat"], "lon": info["lon"],
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
                "source": "metar",
            })
        else:
            est = model_map.get(code, {})
            station_markers.append({
                "type": "station", "icao": code, "name": info["name"],
                "lat": info["lat"], "lon": info["lon"],
                "elevation_ft": info.get("elevation_ft", 0),
                "flight_category": est.get("flight_category", "N/A"),
                "temp_c": est.get("temp_c"),
                "dewpoint_c": None,
                "wind_dir_deg": est.get("wind_dir_deg"),
                "wind_speed_kt": est.get("wind_speed_kt"),
                "wind_gust_kt": None,
                "visibility_sm": None,
                "altimeter_inhg": est.get("altimeter_inhg"),
                "wx_string": "",
                "cloud_layers": "",
                "raw_metar": "",
                "source": "model" if est else "none",
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
        "airline": f.get("airline", ""),
        "aircraft_type": f.get("aircraft_type", ""),
        "registration": f.get("registration", ""),
        "route": f.get("route", ""),
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
