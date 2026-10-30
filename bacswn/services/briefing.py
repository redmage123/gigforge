"""BACSWN — Operations briefing generator.

Synthesizes the platform's real data (current conditions, forecast skill,
climate context, active tropical systems) into a plain-language operations
briefing for the watch officer.

By default the briefing is DETERMINISTIC — composed directly from the data, so
it is always accurate with zero hallucination risk (the right default for an
aviation-safety product). If an LLM endpoint is configured (OLLAMA_URL or
ANTHROPIC_API_KEY) it is used only to rephrase the same facts more fluently;
the underlying numbers never come from the model.
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timezone

import httpx

from services.awc_client import fetch_metars, parse_metar
from services import forecast_correction as fc
from services import climatology as cl

logger = logging.getLogger("bacswn.briefing")

_OLLAMA_URL = os.getenv("OLLAMA_URL", "")          # e.g. http://host:11434
_OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.1:8b-instruct-q4_K_M")
_ANTHROPIC_KEY = os.getenv("ANTHROPIC_API_KEY", "")

_NASSAU = "MYNN"


def _utc_now():
    return datetime.now(timezone.utc)


async def _gather():
    """Collect the real-data facts the briefing is built from."""
    facts: dict = {"generated_at": _utc_now().strftime("%Y-%m-%d %H:%MZ")}

    # Current conditions across the network
    try:
        parsed = [parse_metar(m) for m in await fetch_metars()]
    except Exception:
        parsed = []
    from services.forecast_verification import category_from_metar
    cats = {"VFR": [], "MVFR": [], "IFR": [], "LIFR": []}
    for m in parsed:
        # AWC does not classify Bahamas stations, so derive the category from the
        # raw METAR via MetPy (falling back to any AWC-provided category).
        c = category_from_metar(m.get("raw_text", "")) or (m.get("flight_category") or "").upper()
        if c in cats:
            cats[c].append(m.get("station_id"))
    facts["reporting"] = len(parsed)
    facts["cats"] = cats
    facts["impacted"] = sorted(set(cats["IFR"] + cats["LIFR"]))
    nassau = next((m for m in parsed if m.get("station_id") == _NASSAU), None)
    facts["nassau_temp"] = nassau.get("temp_c") if nassau else None

    # Forecast skill (from the cached out-of-sample scoreboard)
    try:
        sb = fc.get_cached_scoreboard()
        v = sb.get("variables", {})
        facts["skill"] = {
            "overall_raw": sb.get("overall_raw_accuracy_pct"),
            "overall_corr": sb.get("overall_corr_accuracy_pct"),
            "temp_raw": v.get("temp_c", {}).get("raw_mae"),
            "temp_corr": v.get("temp_c", {}).get("corr_mae"),
            "wind_raw": v.get("wind_speed_kt", {}).get("raw_mae"),
            "wind_corr": v.get("wind_speed_kt", {}).get("corr_mae"),
        }
    except Exception:
        facts["skill"] = {}

    # Climate context for Nassau (today vs normal)
    try:
        facts["climo"] = cl.anomaly(_NASSAU, facts.get("nassau_temp"))
    except Exception:
        facts["climo"] = None

    # Active tropical systems
    try:
        from services.hurricane_client import fetch_hurricanes
        storms = await fetch_hurricanes()
        facts["storms"] = [{"name": s.get("name"), "category": s.get("category"),
                            "wind_kt": s.get("wind_kt")} for s in (storms or [])]
    except Exception:
        facts["storms"] = []
    return facts


def _compose(facts: dict) -> dict:
    """Build the deterministic briefing sections from gathered facts."""
    cats = facts.get("cats", {})
    reporting = facts.get("reporting", 0)
    impacted = facts.get("impacted", [])

    # Headline
    if impacted:
        headline = f"IFR/LIFR conditions at {', '.join(impacted)} — monitor closely."
    elif cats.get("MVFR"):
        headline = f"Marginal VFR at {', '.join(cats['MVFR'])}; rest of the FIR VFR."
    else:
        headline = "Nassau FIR generally VFR — no significant aviation weather."

    sections = []

    # Conditions
    cond = (f"{reporting} station(s) reporting. "
            f"{len(cats.get('VFR', []))} VFR, {len(cats.get('MVFR', []))} MVFR, "
            f"{len(cats.get('IFR', []))} IFR, {len(cats.get('LIFR', []))} LIFR.")
    if impacted:
        cond += f" Instrument conditions at: {', '.join(impacted)}."
    sections.append({"title": "Current Conditions", "body": cond})

    # Forecast confidence (cites the verification scoreboard)
    sk = facts.get("skill", {})
    if sk.get("overall_corr") is not None:
        body = (f"Bias-corrected forecast accuracy is running ~{sk['overall_corr']}% "
                f"(vs ~{sk.get('overall_raw')}% raw), measured out-of-sample. ")
        if sk.get("temp_corr") is not None:
            body += f"Typical temperature error ±{sk['temp_corr']}°C"
        if sk.get("wind_corr") is not None:
            body += f", wind ±{sk['wind_corr']}kt"
        body += ". Short-range guidance is reliable; treat longer leads with more caution."
        sections.append({"title": "Forecast Confidence", "body": body})

    # Climate context
    climo = facts.get("climo")
    if climo:
        sections.append({
            "title": "Climate Context",
            "body": (f"Nassau is currently {climo['observed']}°C — {abs(climo['anomaly_c'])}°C "
                     f"{climo['direction']} the {climo['month']} normal of {climo['normal_mean']}°C "
                     f"({climo['base_period']})."),
        })

    # Tropical
    storms = facts.get("storms", [])
    active = [s for s in storms if s.get("category") and s.get("category") != 0]
    if active:
        s = active[0]
        sections.append({
            "title": "Tropical Activity",
            "body": (f"{s['name']} active (Cat {s['category']}, {s.get('wind_kt')}kt). "
                     "Review surge zones, shelter status and evacuation routes."),
        })
    else:
        sections.append({"title": "Tropical Activity", "body": "No active tropical systems affecting the Nassau FIR."})

    # Recommendations
    recs = []
    if impacted:
        recs.append(f"Issue/monitor advisories for {', '.join(impacted)}.")
        recs.append("Brief inbound traffic on instrument approaches.")
    if active:
        recs.append("Activate hurricane operations checklist.")
    if not recs:
        recs.append("Routine operations — continue standard monitoring.")

    text = _to_markdown(facts, headline, sections, recs)
    return {
        "generated_at": facts["generated_at"],
        "headline": headline,
        "sections": sections,
        "recommendations": recs,
        "text": text,
        "data_sources": ["AWC METARs", "Open-Meteo forecasts", "ERA5 climate normals",
                         "NHC tropical", "forecast-verification ledger"],
    }


def _to_markdown(facts, headline, sections, recs):
    lines = [f"**BACSWN Operations Briefing — {facts['generated_at']}**", "", f"_{headline}_", ""]
    for s in sections:
        lines.append(f"**{s['title']}.** {s['body']}")
    lines.append("")
    lines.append("**Recommended actions:**")
    for r in recs:
        lines.append(f"- {r}")
    return "\n".join(lines)


async def _polish_with_llm(text: str) -> tuple[str, bool]:
    """Optionally rephrase the deterministic briefing via a configured LLM.

    Only rephrases — it is instructed not to add or change facts. Returns
    (text, llm_used). Falls back to the deterministic text on any failure.
    """
    prompt = ("Rewrite the following aviation weather operations briefing to read "
              "naturally and professionally for a meteorological watch officer. Do "
              "NOT add, remove, or change any facts, numbers, or station names. Keep "
              "it concise.\n\n" + text)
    try:
        if _OLLAMA_URL:
            async with httpx.AsyncClient(timeout=30.0) as c:
                r = await c.post(f"{_OLLAMA_URL.rstrip('/')}/api/generate",
                                 json={"model": _OLLAMA_MODEL, "prompt": prompt, "stream": False})
                r.raise_for_status()
                out = r.json().get("response", "").strip()
                if out:
                    return out, True
        elif _ANTHROPIC_KEY:
            async with httpx.AsyncClient(timeout=30.0) as c:
                r = await c.post("https://api.anthropic.com/v1/messages",
                                 headers={"x-api-key": _ANTHROPIC_KEY,
                                          "anthropic-version": "2023-06-01",
                                          "content-type": "application/json"},
                                 json={"model": "claude-sonnet-4-6", "max_tokens": 700,
                                       "messages": [{"role": "user", "content": prompt}]})
                r.raise_for_status()
                blocks = r.json().get("content", [])
                out = "".join(b.get("text", "") for b in blocks).strip()
                if out:
                    return out, True
    except Exception as e:
        logger.warning(f"LLM polish failed, using deterministic briefing: {e}")
    return text, False


async def generate_briefing(use_llm: bool = True) -> dict:
    facts = await _gather()
    briefing = _compose(facts)
    briefing["llm_used"] = False
    briefing["llm_available"] = bool(_OLLAMA_URL or _ANTHROPIC_KEY)
    if use_llm and briefing["llm_available"]:
        polished, used = await _polish_with_llm(briefing["text"])
        briefing["text"] = polished
        briefing["llm_used"] = used
    return briefing
