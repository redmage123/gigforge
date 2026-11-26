"""BACSWN — ICAO CORSIA carbon emissions calculator.

What: estimates fuel burn and CO2 for a single flight profile and for every
flight currently in the Bahamas FIR, and maps aircraft categories onto the
fuel-burn classes the estimate uses.

Why: the emissions dashboard, the CORSIA oversight register's FIR observations
and the weather-benefit ledger all need the same category-based estimate, so
the category mapping and the arithmetic live in one place.

How: fuel burn = the category's hourly burn rate (``config.FUEL_BURN_RATES``) x
flight time; CO2 = fuel x the CORSIA factor (``config.CO2_PER_KG_FUEL``, 3.16 kg
CO2 per kg of jet fuel). ADS-B emitter categories (integers) are mapped to the
named classes through ``ICAO_CATEGORY``.
"""

from config import FUEL_BURN_RATES, CO2_PER_KG_FUEL

# ADS-B / OpenSky emitter category -> fuel-burn class.
ICAO_CATEGORY = {5: "heavy", 6: "heavy", 7: "heavy", 4: "large", 3: "medium", 2: "small", 1: "light", 0: "medium"}


def fuel_burn_category(raw) -> str:
    """Fuel-burn class for a flight's category, falling back to "medium".

    Args:
        raw: an ADS-B emitter category (int) or a class name (str) such as "heavy".

    Returns:
        A key of ``FUEL_BURN_RATES``; unknown or missing categories become "medium".
    """
    if isinstance(raw, int):
        return ICAO_CATEGORY.get(raw, "medium")
    return raw if raw in FUEL_BURN_RATES else "medium"


def calculate_flight_emissions(
    aircraft_category: str = "medium",
    flight_time_hours: float = 1.0,
    distance_nm: float | None = None,
) -> dict:
    """Calculate CO2 emissions for a flight using CORSIA methodology.

    Args:
        aircraft_category: heavy, large, medium, small, or light (unknown names use the medium rate)
        flight_time_hours: duration in hours
        distance_nm: optional distance in nautical miles (echoed back; not used in the estimate)

    Returns:
        Dict with fuel_burn_kg, co2_kg, co2_tonnes and the methodology details used.
    """
    burn_rate = FUEL_BURN_RATES.get(aircraft_category, FUEL_BURN_RATES["medium"])
    fuel_burn_kg = burn_rate * flight_time_hours
    co2_kg = fuel_burn_kg * CO2_PER_KG_FUEL

    return {
        "aircraft_category": aircraft_category,
        "fuel_burn_rate_kg_hr": burn_rate,
        "flight_time_hours": round(flight_time_hours, 2),
        "fuel_burn_kg": round(fuel_burn_kg, 1),
        "co2_kg": round(co2_kg, 1),
        "co2_tonnes": round(co2_kg / 1000, 3),
        "distance_nm": distance_nm,
        "methodology": "ICAO CORSIA",
        "emission_factor": CO2_PER_KG_FUEL,
    }


def estimate_airspace_emissions(flights: list[dict], transit_time_hours: float = 0.5) -> dict:
    """Estimate total emissions for flights currently in Bahamas airspace.

    Each flight is assumed to spend ``transit_time_hours`` in the FIR. Integer
    ADS-B categories are mapped through ``ICAO_CATEGORY``; values it does not map
    are passed through unchanged and priced at the medium rate.

    Returns:
        Totals (flights, fuel, CO2) plus a per-flight breakdown.
    """
    total_fuel = 0.0
    total_co2 = 0.0
    flight_emissions = []

    for flight in flights:
        raw_cat = flight.get("category", "medium")
        category = ICAO_CATEGORY.get(raw_cat, raw_cat) if isinstance(raw_cat, int) else raw_cat
        em = calculate_flight_emissions(category, transit_time_hours)
        total_fuel += em["fuel_burn_kg"]
        total_co2 += em["co2_kg"]
        flight_emissions.append({
            "callsign": flight.get("callsign", "N/A"),
            "icao24": flight.get("icao24", ""),
            **em,
        })

    return {
        "total_flights": len(flights),
        "total_fuel_burn_kg": round(total_fuel, 1),
        "total_co2_kg": round(total_co2, 1),
        "total_co2_tonnes": round(total_co2 / 1000, 3),
        "estimated_transit_hours": transit_time_hours,
        "methodology": "ICAO CORSIA",
        "flights": flight_emissions,
    }
