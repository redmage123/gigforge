"""BACSWN — NWS (National Weather Service) API client for alerts.

What: fetches active NWS alerts for the Atlantic marine zones (AM, AN) and
normalises each GeoJSON feature into a flat dict.

Why: the Bahamas has no national alert feed of its own in the platform; the
Miami WFO marine alerts are the closest official warnings for the surrounding
waters.

How: a shared ``httpx.AsyncClient`` with the User-Agent NWS requires; results are
cached for ``CACHE_TTL_ALERTS``. Never raises — returns ``[]`` on failure.
"""

import logging
import httpx
from services.cache import cache
from config import NWS_API_URL, CACHE_TTL_ALERTS

logger = logging.getLogger("bacswn.nws")

_client = httpx.AsyncClient(
    timeout=15.0,
    headers={
        "User-Agent": "(BACSWN SkyWatch Bahamas, contact@ai-elevate.com)",
        "Accept": "application/geo+json",
    },
)


async def fetch_alerts() -> list[dict]:
    """Active NWS marine-zone alerts that may affect the Bahamas; ``[]`` if NWS is unreachable."""
    cached = cache.get("nws:alerts")
    if cached is not None:
        return cached

    try:
        # NWS covers some Bahamas areas via Miami WFO
        resp = await _client.get(f"{NWS_API_URL}/alerts/active", params={
            "area": "AM,AN",  # Atlantic marine zones
            "status": "actual",
            "message_type": "alert",
        })
        resp.raise_for_status()
        data = resp.json()
        features = data.get("features", [])
        alerts = [_parse_alert(f) for f in features]
        cache.set("nws:alerts", alerts, CACHE_TTL_ALERTS)
        logger.info(f"Fetched {len(alerts)} NWS alerts")
        return alerts
    except Exception as e:
        logger.error(f"NWS alert fetch failed: {e}")
        return []


def _parse_alert(feature: dict) -> dict:
    """Parse a NWS alert feature into a normalized dict."""
    props = feature.get("properties", {})
    return {
        "id": props.get("id", ""),
        "event": props.get("event", ""),
        "severity": props.get("severity", ""),
        "certainty": props.get("certainty", ""),
        "urgency": props.get("urgency", ""),
        "headline": props.get("headline", ""),
        "description": props.get("description", ""),
        "instruction": props.get("instruction", ""),
        "area_desc": props.get("areaDesc", ""),
        "effective": props.get("effective", ""),
        "expires": props.get("expires", ""),
        "sender": props.get("senderName", ""),
    }
