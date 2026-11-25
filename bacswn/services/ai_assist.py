"""BACSWN — Claude-powered assistance: fuel-certificate reading and guided-story Q&A.

Rule for both features (the same one the operations briefing follows): the model
reads and explains; it never supplies a figure or makes a decision.

* Certificate reading: Claude transcribes what a proof-of-sustainability document
  says, with the units it uses. Conversions (litres → tonnes, % reduction → a
  life-cycle value) and every eligibility check are done in code. A person still
  checks the pre-filled form and records the claim.
* Story Q&A: Claude answers a presenter's question using only the live state of
  the mesh that the question is about (votes, model reasoning, hand-offs), passed
  in with the question.

Two ways to reach Claude, chosen by AI_BACKEND:

* ``cli`` (default, used for the demo): Claude Code in headless mode, ``claude -p``,
  authenticated by the server's Claude Code login (CLAUDE_CODE_OAUTH_TOKEN). Each
  call runs in an empty temporary directory with no MCP servers, no saved session,
  a spend cap and a timeout. Story questions get no tools at all; certificate
  reading gets only the Read tool, limited to its working directory, where the
  certificate is the only file (reads anywhere else are refused).
* ``api``: the Anthropic Messages API through the official SDK (ANTHROPIC_API_KEY),
  for go-live.

If the chosen backend isn't available, both features report that AI assistance is
not configured and the rest of the app is unaffected.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import shutil
import tempfile
import time
from collections import defaultdict, deque

import anthropic

logger = logging.getLogger("bacswn.ai_assist")

MODEL = "claude-opus-5-5"                 # API backend
CLI_MODEL = os.getenv("AI_CLI_MODEL", "opus")   # CLI backend: Claude Code's alias for the current Opus
CLI_MAX_USD = os.getenv("AI_CLI_MAX_USD", "0.50")   # spend cap per call
CLI_TIMEOUT_S = 180
# API backend: if the model declines a request on policy grounds, the API retries it on a fallback model.
FALLBACK_BETA = "server-side-fallback-2026-07-01"
MAX_UPLOAD_BYTES = 10 * 1024 * 1024
DOC_TYPES = {"application/pdf": "document", "image/png": "image", "image/jpeg": "image", "image/webp": "image"}
DOC_EXT = {"application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp"}
JET_FUEL_KG_PER_L = 0.8           # typical Jet A-1 / SAF blend density used to convert volumes
RATE_LIMIT = (10, 60.0)           # requests per user per window (seconds)
GLOBAL_LIMIT = (60, 3600.0)       # requests across all users per window: the demo login is public

_client: anthropic.AsyncAnthropic | None = None
_calls: dict[str, deque] = defaultdict(deque)
_cli_slots = asyncio.Semaphore(2)  # at most two CLI processes at once


class AIUnavailable(Exception):
    """The AI request could not be served; the message is safe to show."""

    def __init__(self, message: str, status: int = 503):
        super().__init__(message)
        self.status = status


def backend() -> str:
    return "api" if os.getenv("AI_BACKEND", "cli").strip().lower() == "api" else "cli"


def _cli_bin() -> str | None:
    return os.getenv("AI_CLAUDE_BIN") or shutil.which("claude")


def _cli_credentials() -> bool:
    """A Claude Code login the CLI can use: a token in the environment or a saved login."""
    if os.getenv("CLAUDE_CODE_OAUTH_TOKEN") or os.getenv("ANTHROPIC_API_KEY"):
        return True
    return os.path.isfile(os.path.expanduser("~/.claude/.credentials.json"))


def configured() -> bool:
    if backend() == "cli":
        return bool(_cli_bin()) and _cli_credentials()
    return bool(os.getenv("ANTHROPIC_API_KEY"))


def status() -> dict:
    cli = backend() == "cli"
    return {"configured": configured(), "backend": "claude -p" if cli else "api",
            "model": CLI_MODEL if cli else MODEL}


def _get_client() -> anthropic.AsyncAnthropic:
    global _client
    if _client is None:
        _client = anthropic.AsyncAnthropic(timeout=120.0, max_retries=2)
    return _client


def _check_rate(user: str) -> None:
    n, window = RATE_LIMIT
    q = _calls[user]
    now = time.monotonic()
    while q and now - q[0] > window:
        q.popleft()
    if len(q) >= n:
        raise AIUnavailable("Too many AI requests; wait a minute and try again.", 429)
    gn, gwindow = GLOBAL_LIMIT
    g = _calls["*"]
    while g and now - g[0] > gwindow:
        g.popleft()
    if len(g) >= gn:
        raise AIUnavailable("The AI assistant has reached its hourly limit; try again later.", 429)
    q.append(now)
    g.append(now)


async def _ask_claude(user: str, system: str, prompt: str, effort: str, max_tokens: int,
                      schema: dict | None = None, attachment: tuple[bytes, str] | None = None,
                      attachment_name: str = "certificate", max_usd: str | None = None) -> str:
    """Ask Claude; returns the answer text (with a schema, a JSON string matching it).

    attachment: (file bytes, media type) of a document Claude should read.
    attachment_name: file name (without extension) the CLI backend gives it.
    max_usd: CLI spend cap for this call (default CLI_MAX_USD).
    """
    if not configured():
        why = ("no ANTHROPIC_API_KEY" if backend() == "api" else
               "the Claude Code CLI isn't installed" if not _cli_bin() else "the Claude Code CLI has no login")
        raise AIUnavailable(f"AI assistance is not configured on this server ({why}).", 503)
    _check_rate(user)
    if backend() == "cli":
        return await _ask_cli(system, prompt, effort, schema, attachment, attachment_name, max_usd)
    return await _ask_api(system, prompt, effort, max_tokens, schema, attachment)


async def _ask_cli(system: str, prompt: str, effort: str, schema: dict | None,
                   attachment: tuple[bytes, str] | None, attachment_name: str = "certificate",
                   max_usd: str | None = None) -> str:
    args = [_cli_bin(), "-p", "--output-format", "json", "--no-session-persistence", "--strict-mcp-config",
            "--system-prompt", system, "--model", CLI_MODEL, "--effort", effort,
            "--max-budget-usd", max_usd or CLI_MAX_USD]
    if schema:
        args += ["--json-schema", json.dumps(schema)]
    async with _cli_slots:
        with tempfile.TemporaryDirectory(prefix="bacswn-ai-") as cwd:    # no project files, no CLAUDE.md
            if attachment:
                raw, media_type = attachment
                name = f"{attachment_name}.{DOC_EXT[media_type]}"
                with open(os.path.join(cwd, name), "wb") as f:
                    f.write(raw)
                # Only the Read tool. No --allowedTools: Claude Code then permits reads inside the
                # working directory (just the certificate) and refuses any path outside it, so a
                # document carrying injected instructions cannot reach the environment, .env or the DB.
                args += ["--tools", "Read"]
                prompt = f"Read the document ./{name} in the current directory.\n\n{prompt}"
            else:
                args += ["--tools", ""]
            # An empty ANTHROPIC_API_KEY (docker-compose passes one) must not shadow the Claude Code login.
            env = {k: v for k, v in os.environ.items()
                   if not (k in ("ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN") and not v)}
            proc = await asyncio.create_subprocess_exec(
                *args, cwd=cwd, env=env, stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
            try:
                out, err = await asyncio.wait_for(proc.communicate(prompt.encode()), timeout=CLI_TIMEOUT_S)
            except asyncio.TimeoutError:
                proc.kill()
                await proc.wait()
                raise AIUnavailable("The AI took too long to answer; try again.", 504) from None
    try:
        res = json.loads(out.decode() or "{}")
    except ValueError:
        logger.warning("claude -p: unreadable output (exit %s): %s", proc.returncode, err.decode()[:300])
        raise AIUnavailable("The AI returned an unreadable answer; try again.", 502) from None
    if res.get("is_error") or (schema and "structured_output" not in res):
        msg = str(res.get("result") or res.get("subtype") or err.decode() or "unknown error")[:300]
        logger.warning("claude -p error: %s", msg)
        low = msg.lower()
        if "not logged in" in low or "/login" in msg or "authentication" in low or "oauth" in low:
            raise AIUnavailable("The Claude Code CLI on the server isn't logged in.", 503)
        if "budget" in low:
            raise AIUnavailable("The request hit its spend cap; try a shorter question or a smaller file.", 502)
        raise AIUnavailable("The AI couldn't answer just now; try again.", 502)
    if schema:
        return json.dumps(res["structured_output"])
    return str(res.get("result") or "").strip()


async def _ask_api(system: str, prompt: str, effort: str, max_tokens: int, schema: dict | None,
                   attachment: tuple[bytes, str] | None) -> str:
    import base64
    content: list = []
    if attachment:
        raw, media_type = attachment
        content.append({"type": DOC_TYPES[media_type],
                        "source": {"type": "base64", "media_type": media_type,
                                   "data": base64.b64encode(raw).decode()}})
    content.append({"type": "text", "text": prompt})
    output_config: dict = {"effort": effort}
    if schema:
        output_config["format"] = {"type": "json_schema", "schema": schema}
    try:
        resp = await _get_client().beta.messages.create(
            model=MODEL, max_tokens=max_tokens, system=system,
            messages=[{"role": "user", "content": content}],
            output_config=output_config,
            betas=[FALLBACK_BETA], fallbacks="default",
        )
    except anthropic.RateLimitError:
        raise AIUnavailable("The AI service is busy; try again in a minute.", 429) from None
    except anthropic.AuthenticationError:
        logger.error("Anthropic API key rejected")
        raise AIUnavailable("The AI service rejected this server's API key.", 502) from None
    except anthropic.APIStatusError as e:
        logger.error("Anthropic API error %s: %s (request %s)", e.status_code, e.message,
                     getattr(e, "request_id", None))
        raise AIUnavailable(f"The AI service returned an error ({e.status_code}); try again.", 502) from None
    except anthropic.APIConnectionError:
        raise AIUnavailable("Could not reach the AI service; try again.", 502) from None
    if resp.stop_reason == "refusal":
        raise AIUnavailable("The AI declined this request.", 422)
    if resp.stop_reason == "max_tokens":
        raise AIUnavailable("The AI's answer was cut short; try a narrower request.", 502)
    return "".join(b.text for b in resp.content if b.type == "text").strip()


# ── 1. Fuel-certificate reading ─────────────────────────────────────────────

_NULLABLE_STR = {"type": ["string", "null"]}
_NULLABLE_NUM = {"type": ["number", "null"]}
CERT_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "document_kind": {"type": "string", "description": "What the document is, e.g. 'Proof of Sustainability'"},
        "operator_name": _NULLABLE_STR,
        "producer": _NULLABLE_STR,
        "batch_id": _NULLABLE_STR,
        "certificate_ref": _NULLABLE_STR,
        "scheme": _NULLABLE_STR,
        "fuel_type": {"type": ["string", "null"], "enum": ["SAF", "LCAF", None]},
        "pathway": _NULLABLE_STR,
        "feedstock": _NULLABLE_STR,
        "quantity_value": _NULLABLE_NUM,
        "quantity_unit": {"type": ["string", "null"], "enum": ["t", "kg", "L", "m3", "US gal", "other", None]},
        "ls_value": _NULLABLE_NUM,
        "ls_basis": {"type": ["string", "null"], "enum": ["DEFAULT", "ACTUAL", None]},
        "ghg_reduction_pct": _NULLABLE_NUM,
        "year_of_use": {"type": ["integer", "null"]},
        "issue_date": _NULLABLE_STR,
        "evidence": {
            "type": "array",
            "items": {"type": "object", "additionalProperties": False,
                      "properties": {"field": {"type": "string"}, "quote": {"type": "string"}},
                      "required": ["field", "quote"]},
        },
        "unclear": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["document_kind", "operator_name", "producer", "batch_id", "certificate_ref", "scheme",
                 "fuel_type", "pathway", "feedstock", "quantity_value", "quantity_unit", "ls_value",
                 "ls_basis", "ghg_reduction_pct", "year_of_use", "issue_date", "evidence", "unclear"],
}

CERT_SYSTEM = """You transcribe aviation-fuel sustainability documents (proofs of sustainability, \
sustainability declarations, CORSIA eligible fuel certificates) for a state regulator's CORSIA register.

Copy what the document states. Do not calculate, convert units, estimate or fill gaps:
- quantity_value / quantity_unit: the delivered or claimed fuel quantity exactly as written, with its unit.
- ls_value: the life-cycle emissions value in gCO2e/MJ only if the document states one; ls_basis DEFAULT if it \
says it is an ICAO / CORSIA default value, ACTUAL if an actual (calculated) value, otherwise null.
- ghg_reduction_pct: only if the document states a GHG saving as a percentage.
- fuel_type: SAF for sustainable aviation fuel, LCAF for lower-carbon aviation fuel (fossil-based), else null.
- year_of_use: the year the fuel was supplied or used, if stated.
Use null for anything the document does not state. For each value you fill in, add an evidence item quoting \
the words it came from (short). List anything ambiguous, illegible or contradictory in "unclear"."""


def _to_tonnes(value: float | None, unit: str | None) -> tuple[float | None, str | None]:
    """Convert a stated quantity to tonnes; returns (tonnes, note)."""
    if value is None or unit is None:
        return None, None
    if unit == "t":
        return value, None
    if unit == "kg":
        return value / 1000, f"Converted {value:,g} kg to tonnes."
    litres = {"L": value, "m3": value * 1000, "US gal": value * 3.78541}.get(unit)
    if litres is None:
        return None, f"Quantity unit not recognised ({unit}); enter the mass in tonnes yourself."
    t = litres * JET_FUEL_KG_PER_L / 1000
    return t, (f"Converted {value:,g} {unit} to {t:,.3f} t at {JET_FUEL_KG_PER_L} kg/L (typical jet fuel density). "
               "Use the certified mass if the certificate gives one.")


async def read_fuel_certificate(user: str, filename: str, media_type: str, data_b64: str,
                                operator: dict, existing_batches: dict[str, str], periods: list[dict]) -> dict:
    """Pre-fill a fuel claim from a certificate. Checks are deterministic; the model only transcribes."""
    import base64
    from services.carbon_oversight import LS_BASELINE, LS_MAX_ELIGIBLE, RECOGNISED_SCHEMES

    kind = DOC_TYPES.get(media_type)
    if not kind:
        raise AIUnavailable("Upload a PDF, PNG, JPEG or WebP file.", 400)
    try:
        raw = base64.b64decode(data_b64, validate=True)
    except ValueError:
        raise AIUnavailable("The file could not be read.", 400) from None
    if not raw:
        raise AIUnavailable("The file is empty.", 400)
    if len(raw) > MAX_UPLOAD_BYTES:
        raise AIUnavailable("The file is larger than 10 MB.", 400)

    text = await _ask_claude(user, CERT_SYSTEM, "Transcribe this document.", effort="medium",
                             max_tokens=8000, schema=CERT_SCHEMA, attachment=(raw, media_type))
    try:
        x = json.loads(text)
    except ValueError:
        raise AIUnavailable("The AI returned an unreadable answer; try again.", 502) from None

    notes, warnings = [], []
    mass_t, note = _to_tonnes(x.get("quantity_value"), x.get("quantity_unit"))
    if note:
        notes.append(note)
    ls = x.get("ls_value")
    if ls is None and x.get("ghg_reduction_pct") is not None:
        ls = round(LS_BASELINE * (1 - x["ghg_reduction_pct"] / 100), 2)
        notes.append(f"No life-cycle value stated; derived {ls} gCO₂e/MJ from the stated "
                     f"{x['ghg_reduction_pct']:g} % saving against the {LS_BASELINE:g} gCO₂e/MJ baseline.")

    fields = {
        "year": x.get("year_of_use"), "fuel_type": x.get("fuel_type"),
        "mass_t": round(mass_t, 3) if mass_t is not None else None,
        "ls_value": ls, "ls_basis": x.get("ls_basis"),
        "batch_id": x.get("batch_id"), "scheme": x.get("scheme"), "certificate_ref": x.get("certificate_ref"),
        "pathway": x.get("pathway"), "feedstock": x.get("feedstock"), "producer": x.get("producer"),
    }
    labels = {"year": "year of use", "fuel_type": "fuel type", "mass_t": "fuel mass", "ls_value": "life-cycle value",
              "ls_basis": "life-cycle value basis", "batch_id": "batch ID", "scheme": "certification scheme"}
    missing = [labels[k] for k in labels if fields[k] in (None, "")]
    if missing:
        warnings.append("Not found on the document: " + ", ".join(missing) + ". Fill these in yourself.")
    if ls is not None and ls > LS_MAX_ELIGIBLE:
        warnings.append(f"Life-cycle value {ls:g} gCO₂e/MJ is above {LS_MAX_ELIGIBLE:g}: less than a 10 % cut, "
                        "so the fuel is not CORSIA-eligible and would earn no reduction.")
    if fields["scheme"] and not any(s in fields["scheme"].upper() for s in RECOGNISED_SCHEMES):
        warnings.append(f"Scheme '{fields['scheme']}' is not one of the ICAO-approved schemes on file "
                        f"({', '.join(RECOGNISED_SCHEMES)}).")
    if fields["batch_id"]:
        who = existing_batches.get(fields["batch_id"].strip().lower())
        if who:
            warnings.append(f"Batch {fields['batch_id']} is already in the register ({who}). Recording it again "
                            "will be flagged as a double claim.")
    year = fields["year"]
    if year is not None and not any(p["years"][0] <= year <= p["years"][1] for p in periods):
        warnings.append(f"Year {year} is outside the CORSIA compliance periods.")
    # Whole-word match ("Test Air" must not match "Bahamasair"); generic company words don't count.
    def words(t):
        return {w for w in re.findall(r"[a-z0-9]+", (t or "").lower())
                if len(w) > 2 and w not in ("ltd", "limited", "holdings", "inc", "airline", "airlines", "airways", "the")}
    on_doc, ours = words(x.get("operator_name")), words(operator["name"])
    if on_doc and ours and not (on_doc & ours) and operator["icao_designator"].lower() not in on_doc:
        warnings.append(f"The document names '{x['operator_name']}', not {operator['name']} "
                        f"({operator['icao_designator']}). Check it belongs to this operator.")
    notes.extend(f"Unclear on the document: {u}" for u in x.get("unclear") or [])

    return {
        "fields": fields, "warnings": warnings, "notes": notes,
        "document_kind": x.get("document_kind"), "operator_on_document": x.get("operator_name"),
        "evidence": x.get("evidence") or [], "filename": filename, "model": status()["model"],
        "provenance": f"Fields pre-filled by AI (Claude) from {filename}; checked by {user} before recording.",
    }


# ── 2. Guided-story Q&A ─────────────────────────────────────────────────────

STORY_SYSTEM = """You answer questions from people watching a live demonstration of SkyWatch Bahamas, a \
simulated mesh of 15 AI weather stations in the Bahamas.

How the mesh works: each station runs three models. TEMPO reads the station's own sensors; VISTA reads radar \
and satellite and looks 30 minutes ahead; LEXIS reads METAR weather reports, climatology and storm warnings \
from upstream stations. Two of three must agree on the weather call (CLEAR, SHOWERS, IFR = fog or low cloud, \
TSRA = thunderstorm, SQUALL). An outvoted model files a minority report, later marked vindicated or dismissed; \
a model whose reports keep being proven wrong is quarantined, and restored after an hour of matching calls. \
If all three differ, a satellite pass breaks the tie. A hazard call is checked by up to four neighbouring \
stations with their own radar plus the satellite; if confirmed, an alert goes to the BACSWN hub in Nassau, \
and if rejected the station gets a maintenance ticket. Stations pass storm warnings (PROPAGATION) with an \
arrival time to stations downstream. With no route to the hub, alerts queue and are delivered when links return.
Each link between stations carries every channel both ends have (a wired line to the hub at the main airport \
sites, VHF radio, cellular, satellite) and uses the fastest one that works; if it fails, the link switches at \
once to the next and switches back only after the better channel has been stable for 30 minutes. Squall gusts \
can bring down VHF masts, take cellular towers off the air or cut power to telephone exchanges; lightning \
causes short outages; the satellite terminal is not affected by weather.

Answer using the mesh state supplied with the question; quote the actual votes, calls and reasons from it. \
If the state does not show something, say so plainly rather than guess, and never invent numbers. It is a \
simulation: do not present it as real weather. Answer in plain English for a non-specialist audience, in at \
most 120 words. Write plain text only: no Markdown, bullet points, bold or headings."""


def story_context(sim, story: str | None, station: str | None) -> dict:
    """The parts of the live mesh state a question about this step can be answered from."""
    from services import mesh_comms as comms
    from services.mesh_network import HUB
    stations = list(sim.STORIES[story]["stations"]) if story in sim.STORIES else []
    if station and station in sim.nodes and station not in stations:
        stations.insert(0, station)
    if not stations:   # whole-network question: the stations that are not simply clear and healthy
        stations = [n["station"] for n in map(sim._node_view, sim.nodes.values())
                    if n["status"] != "healthy" or n["verdict"]["call"] != "CLEAR"][:5] or [HUB]
    involved = set(stations)

    def node(code):
        v = sim._node_view(sim.nodes[code])
        return {
            "station": code, "name": v.get("name"), "status": v["status"], "verdict": v["verdict"],
            "models": [{k: p.get(k) for k in ("id", "call", "confidence", "reason", "quarantined", "corrupted")}
                       for p in v["precogs"]],
            "suspect": v.get("suspect"), "queued_messages": v.get("queue"),
            "route_to_hub": v.get("route_to_hub"), "sensor_faults": v.get("sensor_faults"),
            "upstream_warnings": v.get("warnings"), "satellite": v.get("satellite"),
            "comms_equipment": v.get("comms"),
        }

    msgs = [m for m in sim.messages if m["type"] != "HEARTBEAT" and involved & set(m["path"])]
    return {
        "sim_time": sim.sim_time().isoformat(),
        "story_step": sim.story,
        "stations": [node(s) for s in stations if s in sim.nodes],
        "peer_reviews": [e for e in sim.consensus_log if e["station"] in involved][:5],
        "minority_reports": [r for r in sim.minority_reports if r["station"] in involved][:6],
        "storm_handoffs": [p for p in sim.propagation.values() if p["source"] in involved or p["target"] in involved][:6],
        "recent_messages": [{k: m[k] for k in ("type", "path", "via", "detail")} for m in msgs[:8]],
        "events": [e for e in sim.events if e["station"] in involved or e["station"] == "—"][:8],
        "links": [{"between": [l["a"], l["b"]], "latency_ms": l["latency_ms"], **comms.link_view(sim, l)}
                  for l in sim.links.values() if involved & {l["a"], l["b"]}][:12],
    }


async def ask_about_story(user: str, question: str, context: dict, step_title: str = "", step_caption: str = "") -> dict:
    question = (question or "").strip()
    if not question:
        raise AIUnavailable("Type a question first.", 400)
    if len(question) > 500:
        raise AIUnavailable("Keep the question under 500 characters.", 400)
    step = f"The presenter is on the step titled: {step_title}\nCaption shown: {step_caption}\n\n" if step_title else ""
    prompt = (f"{step}Live mesh state (JSON):\n{json.dumps(context, default=str)}\n\n"
              f"Question from the audience: {question}")
    answer = await _ask_claude(user, STORY_SYSTEM, prompt, effort="low", max_tokens=4000)
    return {"answer": answer, "model": status()["model"], "sim_time": context.get("sim_time")}
