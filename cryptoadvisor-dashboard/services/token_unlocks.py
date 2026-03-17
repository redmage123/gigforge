"""Token unlock calendar service with hardcoded schedule data."""

from datetime import datetime, timedelta, timezone

# Hardcoded token unlock schedule (approximate dates from public sources)
# Real-time data is behind paywalls (TokenUnlocks, etc.)
UNLOCK_SCHEDULE: list[dict] = [
    # ARB - Arbitrum
    {"token": "ARB", "date": "2026-03-16", "amount": 92_650_000, "pct_of_supply": 0.73, "type": "investor", "notes": "Investor & team unlock tranche"},
    {"token": "ARB", "date": "2026-04-16", "amount": 92_650_000, "pct_of_supply": 0.73, "type": "team", "notes": "Monthly team vesting"},
    {"token": "ARB", "date": "2026-06-16", "amount": 92_650_000, "pct_of_supply": 0.73, "type": "investor", "notes": "Investor unlock tranche"},
    # OP - Optimism
    {"token": "OP", "date": "2026-03-31", "amount": 31_340_000, "pct_of_supply": 0.73, "type": "ecosystem", "notes": "Ecosystem fund distribution"},
    {"token": "OP", "date": "2026-05-31", "amount": 31_340_000, "pct_of_supply": 0.73, "type": "team", "notes": "Core contributors vesting"},
    # APT - Aptos
    {"token": "APT", "date": "2026-04-12", "amount": 11_310_000, "pct_of_supply": 0.98, "type": "investor", "notes": "Monthly investor unlock"},
    {"token": "APT", "date": "2026-05-12", "amount": 11_310_000, "pct_of_supply": 0.98, "type": "team", "notes": "Monthly team unlock"},
    # SUI
    {"token": "SUI", "date": "2026-04-03", "amount": 64_190_000, "pct_of_supply": 0.66, "type": "investor", "notes": "Series A/B investor unlock"},
    {"token": "SUI", "date": "2026-05-03", "amount": 64_190_000, "pct_of_supply": 0.66, "type": "team", "notes": "Monthly team vesting"},
    # SEI
    {"token": "SEI", "date": "2026-03-15", "amount": 55_000_000, "pct_of_supply": 0.69, "type": "ecosystem", "notes": "Ecosystem and growth fund"},
    {"token": "SEI", "date": "2026-06-15", "amount": 55_000_000, "pct_of_supply": 0.69, "type": "investor", "notes": "Investor vesting tranche"},
    # TIA - Celestia
    {"token": "TIA", "date": "2026-10-31", "amount": 175_600_000, "pct_of_supply": 17.23, "type": "investor", "notes": "Major cliff unlock for early backers"},
    {"token": "TIA", "date": "2026-11-30", "amount": 8_780_000, "pct_of_supply": 0.86, "type": "team", "notes": "Monthly team vesting post-cliff"},
    # JTO - Jito
    {"token": "JTO", "date": "2026-12-07", "amount": 135_000_000, "pct_of_supply": 11.36, "type": "investor", "notes": "Major cliff unlock"},
    # PYTH
    {"token": "PYTH", "date": "2026-05-20", "amount": 213_600_000, "pct_of_supply": 1.41, "type": "ecosystem", "notes": "Ecosystem growth allocation"},
    {"token": "PYTH", "date": "2026-08-20", "amount": 213_600_000, "pct_of_supply": 1.41, "type": "team", "notes": "Publisher rewards and team"},
    # WLD - Worldcoin
    {"token": "WLD", "date": "2026-07-24", "amount": 6_000_000, "pct_of_supply": 0.06, "type": "ecosystem", "notes": "Community allocation"},
    {"token": "WLD", "date": "2026-03-24", "amount": 13_500_000, "pct_of_supply": 0.13, "type": "team", "notes": "Monthly team unlock"},
    # STRK - StarkNet
    {"token": "STRK", "date": "2026-04-15", "amount": 64_000_000, "pct_of_supply": 0.64, "type": "investor", "notes": "Early contributor unlock"},
    {"token": "STRK", "date": "2026-05-15", "amount": 64_000_000, "pct_of_supply": 0.64, "type": "team", "notes": "Monthly team vesting"},
    # DYM - Dymension
    {"token": "DYM", "date": "2026-03-21", "amount": 33_330_000, "pct_of_supply": 3.33, "type": "investor", "notes": "Monthly investor unlock"},
    {"token": "DYM", "date": "2026-04-21", "amount": 33_330_000, "pct_of_supply": 3.33, "type": "team", "notes": "Monthly team unlock"},
    # MANTA
    {"token": "MANTA", "date": "2026-04-18", "amount": 18_750_000, "pct_of_supply": 1.87, "type": "team", "notes": "Quarterly team unlock"},
    {"token": "MANTA", "date": "2026-07-18", "amount": 18_750_000, "pct_of_supply": 1.87, "type": "investor", "notes": "Quarterly investor unlock"},
    # ALT - AltLayer
    {"token": "ALT", "date": "2026-03-25", "amount": 105_000_000, "pct_of_supply": 1.05, "type": "ecosystem", "notes": "Protocol incentives release"},
    {"token": "ALT", "date": "2026-06-25", "amount": 105_000_000, "pct_of_supply": 1.05, "type": "investor", "notes": "Investor vesting tranche"},
]


def _parse_date(date_str: str) -> datetime:
    """Parse a date string to datetime in UTC."""
    return datetime.strptime(date_str, "%Y-%m-%d").replace(tzinfo=timezone.utc)


def get_upcoming_unlocks(days: int = 30) -> list[dict]:
    """Return unlocks within the next N days, sorted by date."""
    now = datetime.now(timezone.utc)
    cutoff = now + timedelta(days=days)

    upcoming = []
    for unlock in UNLOCK_SCHEDULE:
        unlock_date = _parse_date(unlock["date"])
        if now <= unlock_date <= cutoff:
            entry = {**unlock, "days_until": (unlock_date - now).days}
            upcoming.append(entry)

    upcoming.sort(key=lambda x: x["date"])
    return upcoming


def get_unlock_calendar() -> list[dict]:
    """Return all future unlocks sorted by date."""
    now = datetime.now(timezone.utc)
    future = []
    for unlock in UNLOCK_SCHEDULE:
        unlock_date = _parse_date(unlock["date"])
        if unlock_date >= now:
            entry = {**unlock, "days_until": (unlock_date - now).days}
            future.append(entry)

    future.sort(key=lambda x: x["date"])
    return future


def get_unlock_impact(token: str) -> dict:
    """Analyze unlock impact for a specific token."""
    token_upper = token.upper()
    token_unlocks = [u for u in UNLOCK_SCHEDULE if u["token"] == token_upper]

    if not token_unlocks:
        return {"token": token_upper, "error": "No unlock data available for this token"}

    now = datetime.now(timezone.utc)
    future_unlocks = [u for u in token_unlocks if _parse_date(u["date"]) >= now]
    total_future_amount = sum(u["amount"] for u in future_unlocks)
    total_future_pct = sum(u["pct_of_supply"] for u in future_unlocks)

    # Estimate sell pressure: team/investor unlocks typically see 10-30% sold
    estimated_sell_pressure_pct = total_future_pct * 0.2  # conservative 20% assumption

    next_unlock = min(future_unlocks, key=lambda x: x["date"]) if future_unlocks else None

    return {
        "token": token_upper,
        "total_future_unlocks": len(future_unlocks),
        "total_tokens_to_unlock": total_future_amount,
        "total_pct_of_supply": round(total_future_pct, 2),
        "estimated_sell_pressure_pct": round(estimated_sell_pressure_pct, 2),
        "next_unlock": next_unlock,
        "all_unlocks": sorted(future_unlocks, key=lambda x: x["date"]),
        "risk_level": "high" if total_future_pct > 10 else "medium" if total_future_pct > 3 else "low",
    }
