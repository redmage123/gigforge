"""BACSWN — ICAO CORSIA carbon emissions calculator."""

from config import FUEL_BURN_RATES, CO2_PER_KG_FUEL


def calculate_flight_emissions(
    aircraft_category: str = "medium",
    flight_time_hours: float = 1.0,
    distance_nm: float | None = None,
) -> dict:
    """Calculate CO2 emissions for a flight using CORSIA methodology.

    Args:
        aircraft_category: heavy, large, medium, small, or light
        flight_time_hours: duration in hours
        distance_nm: optional distance in nautical miles

    Returns:
        Dict with fuel_burn_kg, co2_kg, methodology details
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
    """Estimate total emissions for flights currently in Bahamas airspace."""
    total_fuel = 0.0
    total_co2 = 0.0
    flight_emissions = []

    for flight in flights:
        category = flight.get("category", "medium")
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
