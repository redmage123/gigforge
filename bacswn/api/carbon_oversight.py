"""BACSWN — CORSIA oversight register API (state-side verification of operators).

What: the HTTP routes under /api/carbon-oversight for the CORSIA oversight
register (services/carbon_oversight.py), the National Emissions Registry file
exchange (services/ner_registry.py) and the AI assistance that reads documents
and drafts text (services/oversight_ai.py).

Why: keeps HTTP concerns (who may write, request parsing, file downloads) out of
the domain services, which stay testable without a web server.

How: reads are open to any signed-in user; anything that records evidence,
decides a claim or runs an AI write workflow requires an administrator
(``_require_writer``). Service functions raise ``BacswnError`` subclasses
(``OversightError``, ``RegistryError``, ``AIUnavailable``), which the handler in
main.py renders as ``{"error", "detail"}`` JSON with the error's HTTP status.
"""

import json

from fastapi import APIRouter, Request
from fastapi.responses import Response

from services import ai_assist
from services import carbon_oversight as co
from services import ner_registry as ner
from services import oversight_ai as oai
from services.errors import BacswnPermissionError, BacswnValidationError

router = APIRouter()

# Recording evidence and deciding on claims is a regulator action.
WRITE_ROLES = {"admin"}


def _user(request: Request) -> dict:
    """The signed-in user's token claims set by the auth middleware ({} if none)."""
    return getattr(request.state, "user", None) or {}


def _require_writer(request: Request) -> str:
    """The signed-in administrator's username.

    Raises:
        BacswnPermissionError: the user's role may not change the register (HTTP 403).
    """
    user = _user(request)
    if user.get("role") not in WRITE_ROLES:
        raise BacswnPermissionError("Only administrators can change the oversight register")
    return user["sub"]


async def _body(request: Request) -> dict:
    """The JSON request body as a dict; {} if it is missing, not JSON, or not an object."""
    try:
        data = await request.json()
    except ValueError:
        data = None
    return data if isinstance(data, dict) else {}


def _upload(body: dict, default_name: str) -> dict:
    """The uploaded file in a request body: {"filename" (max 120 chars), "media_type", "data" (base64)}."""
    return {"filename": str(body.get("filename") or default_name)[:120],
            "media_type": str(body.get("media_type") or ""),
            "data": str(body.get("data") or "")}


def _download(content: str, media_type: str, filename: str) -> Response:
    """A file download response (Content-Disposition: attachment)."""
    return Response(content=content, media_type=media_type,
                    headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@router.get("/periods")
async def periods():
    """The CORSIA compliance periods and which one is current."""
    return {"periods": co.periods()}


@router.get("/register")
async def register(period: str):
    """The register for a compliance period: operator positions, claims and findings."""
    return await co.register(period)


@router.get("/register.csv")
async def register_csv(period: str):
    """The period's unit-cancellation claims as a CSV download."""
    return _download(await co.export_csv(period), "text/csv", f"corsia-claims-{period}.csv")


@router.get("/operators/{operator_id}")
async def operator(operator_id: int):
    """One operator's full record: report revisions, claims and review history."""
    return await co.operator_detail(operator_id)


@router.post("/operators")
async def create_operator(request: Request):
    """Register an aircraft operator (administrators only)."""
    user = _require_writer(request)
    return await co.create_operator(await _body(request), user)


@router.post("/operators/{operator_id}/reports")
async def add_report(operator_id: int, request: Request):
    """Record a verified annual emissions report for an operator (administrators only)."""
    user = _require_writer(request)
    return await co.add_emission_report(operator_id, await _body(request), user)


@router.post("/operators/{operator_id}/claims")
async def add_claim(operator_id: int, request: Request):
    """Record a unit-cancellation claim for an operator (administrators only)."""
    user = _require_writer(request)
    return await co.add_unit_claim(operator_id, await _body(request), user)


@router.post("/claims/{claim_id}/review")
async def review(claim_id: int, request: Request):
    """Record a review decision on a unit-cancellation claim (administrators only)."""
    user = _require_writer(request)
    return await co.review_claim(claim_id, await _body(request), user)


@router.post("/operators/{operator_id}/fuel-claims")
async def add_fuel_claim(operator_id: int, request: Request):
    """Record an eligible-fuel claim for an operator (administrators only)."""
    user = _require_writer(request)
    return await co.add_fuel_claim(operator_id, await _body(request), user)


@router.post("/fuel-claims/{claim_id}/review")
async def review_fuel(claim_id: int, request: Request):
    """Record a review decision on an eligible-fuel claim (administrators only)."""
    user = _require_writer(request)
    return await co.review_fuel_claim(claim_id, await _body(request), user)


@router.get("/fuel-claims.csv")
async def fuel_claims_csv(period: str):
    """The period's eligible-fuel claims as a CSV download."""
    return _download(await co.export_fuel_csv(period), "text/csv", f"corsia-fuel-claims-{period}.csv")


# ── Bahamas National Emissions Registry (file exchange) ────────────────────

@router.get("/ner/status")
async def ner_status():
    """Registry connection status and a summary of the latest imported statement."""
    return await ner.status()


@router.get("/ner/statements")
async def ner_statements():
    """Every imported registry statement, newest first."""
    return {"statements": await ner.statements()}


@router.post("/ner/statements")
async def ner_import(request: Request):
    """Import a registry statement: {"format": "json"|"csv", "content": "...", "as_of"?, "reference"?}."""
    user = _require_writer(request)
    return await ner.import_statement(await _body(request), user)


@router.get("/ner/template.csv")
async def ner_template():
    """A CSV statement template download."""
    return _download(ner.template_csv(), "text/csv", "ner-statement-template.csv")


@router.get("/ner/state-report")
async def ner_state_report(period: str, request: Request):
    """The period's register packaged for submission to the registry (JSON download)."""
    reg = await co.register(period)
    checks = {c["id"]: c["ner_check"] for c in reg["claims"] if c.get("ner_check")}
    report = ner.state_report(reg, checks, _user(request).get("sub", "?"))
    return _download(json.dumps(report, indent=2), "application/json", f"ner-state-report-{period}.json")


@router.get("/ner/authorisations")
async def ner_authorisations():
    """Letters of authorisation on file (latest revision of each)."""
    return {"authorisations": await ner.authorisations()}


@router.post("/ner/authorisations")
async def ner_add_authorisation(request: Request):
    """Record a letter of authorisation (append-only; a revision is a new row with the same reference)."""
    user = _require_writer(request)
    return await ner.add_authorisation(await _body(request), user)


# ── AI assistance (services/oversight_ai.py): drafts and pre-filled forms only ──

async def _operator(operator_id) -> dict:
    """The operator named in a request body.

    Raises:
        OversightError: the id is missing or not a number; OversightNotFoundError if there is no such operator.
    """
    try:
        oid = int(operator_id)
    except (TypeError, ValueError):
        raise co.OversightError("Choose an operator") from None
    return await co.get_operator(oid)


@router.post("/ai/read/{kind}")
async def ai_read(kind: str, request: Request):
    """Read a document and return a pre-filled form: report, cancellation, authorisation or statement."""
    user = _require_writer(request)
    body = await _body(request)
    upload = _upload(body, "document")
    if kind == "report":
        return await oai.read_emissions_report(user, upload, await _operator(body.get("operator_id")))
    if kind == "cancellation":
        return await oai.read_cancellation(user, upload, await _operator(body.get("operator_id")),
                                           str(body.get("period") or ""))
    if kind == "authorisation":
        return await oai.read_authorisation(user, upload)
    if kind == "statement":
        return await oai.read_registry_extract(user, upload)
    raise co.OversightNotFoundError("Unknown document type")


@router.post("/ai/review-brief")
async def ai_review_brief(request: Request):
    """AI review brief for a claim: {"claim_id", "kind": "unit"|"fuel"} (administrators only)."""
    user = _require_writer(request)
    body = await _body(request)
    try:
        claim_id = int(body.get("claim_id"))
    except (TypeError, ValueError):
        raise BacswnValidationError("claim_id is required") from None
    return await oai.review_brief(user, str(body.get("kind") or "unit"), claim_id)


@router.post("/ai/rules-check")
async def ai_rules_check(request: Request):
    """Compare an uploaded ICAO document with the rules on file (administrators only; nothing is changed)."""
    user = _require_writer(request)
    return await oai.check_rules(user, _upload(await _body(request), "document"))


@router.post("/ai/ask")
async def ai_ask(request: Request):
    """Answer a question about the register: {"question"}."""
    body = await _body(request)
    return await oai.ask_register(_user(request).get("sub", "?"), str(body.get("question") or ""))


@router.post("/ai/explain")
async def ai_explain(request: Request):
    """Explain an automatic finding: {"period", "finding": {kind, operator_id, claim_id, fuel_claim_id, message}}."""
    body = await _body(request)
    f = body.get("finding") if isinstance(body.get("finding"), dict) else {}
    return await oai.explain_finding(_user(request).get("sub", "?"), str(body.get("period") or ""), f)


@router.post("/ai/draft")
async def ai_draft(request: Request):
    """Draft outgoing correspondence: {"kind", "period", "operator_id"?} (administrators only)."""
    user = _require_writer(request)
    body = await _body(request)
    op = body.get("operator_id")
    try:
        op = int(op) if op not in (None, "") else None
    except (TypeError, ValueError):
        raise BacswnValidationError("operator_id must be a number") from None
    return await oai.draft_document(user, str(body.get("kind") or ""), str(body.get("period") or ""), op)


@router.post("/operators/{operator_id}/fuel-certificate")
async def read_fuel_certificate(operator_id: int, request: Request):
    """AI-assisted: pre-fill a fuel claim from an uploaded certificate. Nothing is recorded."""
    user = _require_writer(request)
    upload = _upload(await _body(request), "certificate")
    op, batches = await co.fuel_certificate_context(operator_id)
    return await ai_assist.read_fuel_certificate(
        user, upload["filename"], upload["media_type"], upload["data"], op, batches, co.periods())
