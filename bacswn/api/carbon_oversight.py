"""BACSWN — CORSIA oversight register API (state-side verification of operators)."""

import json

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, Response

from services import carbon_oversight as co
from services import ner_registry as ner

router = APIRouter()

# Recording evidence and deciding on claims is a regulator action.
WRITE_ROLES = {"admin"}


def _user(request: Request) -> dict:
    return getattr(request.state, "user", None) or {}


def _forbidden(request: Request) -> JSONResponse | None:
    if _user(request).get("role") not in WRITE_ROLES:
        return JSONResponse(status_code=403, content={"error": "Only administrators can change the oversight register"})
    return None


async def _run(coro):
    try:
        return await coro
    except co.OversightError as e:
        return JSONResponse(status_code=e.status, content={"error": str(e)})


async def _body(request: Request) -> dict:
    try:
        data = await request.json()
    except ValueError:
        data = None
    return data if isinstance(data, dict) else {}


@router.get("/periods")
async def periods():
    return {"periods": co.periods()}


@router.get("/register")
async def register(period: str):
    return await _run(co.register(period))


@router.get("/register.csv")
async def register_csv(period: str):
    result = await _run(co.export_csv(period))
    if isinstance(result, JSONResponse):
        return result
    return Response(content=result, media_type="text/csv",
                    headers={"Content-Disposition": f'attachment; filename="corsia-claims-{period}.csv"'})


@router.get("/operators/{operator_id}")
async def operator(operator_id: int):
    return await _run(co.operator_detail(operator_id))


@router.post("/operators")
async def create_operator(request: Request):
    if denied := _forbidden(request):
        return denied
    return await _run(co.create_operator(await _body(request), _user(request)["sub"]))


@router.post("/operators/{operator_id}/reports")
async def add_report(operator_id: int, request: Request):
    if denied := _forbidden(request):
        return denied
    return await _run(co.add_emission_report(operator_id, await _body(request), _user(request)["sub"]))


@router.post("/operators/{operator_id}/claims")
async def add_claim(operator_id: int, request: Request):
    if denied := _forbidden(request):
        return denied
    return await _run(co.add_unit_claim(operator_id, await _body(request), _user(request)["sub"]))


@router.post("/claims/{claim_id}/review")
async def review(claim_id: int, request: Request):
    if denied := _forbidden(request):
        return denied
    return await _run(co.review_claim(claim_id, await _body(request), _user(request)["sub"]))


@router.post("/operators/{operator_id}/fuel-claims")
async def add_fuel_claim(operator_id: int, request: Request):
    if denied := _forbidden(request):
        return denied
    return await _run(co.add_fuel_claim(operator_id, await _body(request), _user(request)["sub"]))


@router.post("/fuel-claims/{claim_id}/review")
async def review_fuel(claim_id: int, request: Request):
    if denied := _forbidden(request):
        return denied
    return await _run(co.review_fuel_claim(claim_id, await _body(request), _user(request)["sub"]))


@router.get("/fuel-claims.csv")
async def fuel_claims_csv(period: str):
    result = await _run(co.export_fuel_csv(period))
    if isinstance(result, JSONResponse):
        return result
    return Response(content=result, media_type="text/csv",
                    headers={"Content-Disposition": f'attachment; filename="corsia-fuel-claims-{period}.csv"'})


# ── Bahamas National Emissions Registry (file exchange) ────────────────────

async def _run_ner(coro):
    try:
        return await coro
    except ner.RegistryError as e:
        return JSONResponse(status_code=e.status, content={"error": str(e)})


@router.get("/ner/status")
async def ner_status():
    return await ner.status()


@router.get("/ner/statements")
async def ner_statements():
    return {"statements": await ner.statements()}


@router.post("/ner/statements")
async def ner_import(request: Request):
    """Import a registry statement: {"format": "json"|"csv", "content": "...", "as_of"?, "reference"?}."""
    if denied := _forbidden(request):
        return denied
    return await _run_ner(ner.import_statement(await _body(request), _user(request)["sub"]))


@router.get("/ner/template.csv")
async def ner_template():
    return Response(content=ner.template_csv(), media_type="text/csv",
                    headers={"Content-Disposition": 'attachment; filename="ner-statement-template.csv"'})


@router.get("/ner/state-report")
async def ner_state_report(period: str, request: Request):
    """The period's register packaged for submission to the registry (JSON download)."""
    reg = await _run(co.register(period))
    if isinstance(reg, JSONResponse):
        return reg
    checks = {c["id"]: c["ner_check"] for c in reg["claims"] if c.get("ner_check")}
    report = ner.state_report(reg, checks, _user(request).get("sub", "?"))
    return Response(content=json.dumps(report, indent=2), media_type="application/json",
                    headers={"Content-Disposition": f'attachment; filename="ner-state-report-{period}.json"'})


@router.post("/operators/{operator_id}/fuel-certificate")
async def read_fuel_certificate(operator_id: int, request: Request):
    """AI-assisted: pre-fill a fuel claim from an uploaded certificate. Nothing is recorded."""
    if denied := _forbidden(request):
        return denied
    from services import ai_assist
    from services.database import get_db
    body = await _body(request)
    try:
        async with get_db() as db:
            op = await co._require_operator(db, operator_id)
            rows = await (await db.execute(
                "SELECT f.id, f.batch_id, o.icao_designator, COALESCE((SELECT decision FROM carbon_fuel_reviews v"
                " WHERE v.claim_id = f.id ORDER BY v.id DESC LIMIT 1), 'PENDING') AS status"
                " FROM carbon_fuel_claims f JOIN carbon_operators o ON o.id = f.operator_id")).fetchall()
    except co.OversightError as e:
        return JSONResponse(status_code=e.status, content={"error": str(e)})
    batches = {r["batch_id"].strip().lower(): f"claim F{r['id']} by {r['icao_designator']}, {r['status'].lower()}"
               for r in rows if r["status"] != "REJECTED"}
    try:
        return await ai_assist.read_fuel_certificate(
            _user(request).get("sub", "?"), str(body.get("filename") or "certificate")[:120],
            str(body.get("media_type") or ""), str(body.get("data") or ""), op, batches, co.periods())
    except ai_assist.AIUnavailable as e:
        return JSONResponse(status_code=e.status, content={"error": str(e)})
