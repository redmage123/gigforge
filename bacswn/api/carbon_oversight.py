"""BACSWN — CORSIA oversight register API (state-side verification of operators)."""

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, Response

from services import carbon_oversight as co

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
