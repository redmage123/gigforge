"""Firm accounts API: firms, members, invitations, sign-in policy, SAML setup, audit trail, access reviews."""

import csv
import io

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel

from services import audit_events, firms, portfolios, sso
from services.db import Unavailable
from services.user_data import get_username

router = APIRouter()


def _call(fn, *a, **kw):
    try:
        return fn(*a, **kw)
    except firms.FirmError as exc:
        raise HTTPException(exc.status, str(exc))
    except sso.SSOError as exc:
        raise HTTPException(400, str(exc))
    except portfolios.AccessError as exc:
        raise HTTPException(exc.status, str(exc))
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    except Unavailable:
        raise HTTPException(503, "Firm accounts need the database, which isn't available here.")


class FirmBody(BaseModel):
    name: str | None = None
    sso_domains: list[str] | None = None
    sso_required: bool | None = None
    default_role: str | None = None
    session_hours: int | None = None


@router.get("/")
async def list_firms(request: Request):
    user = get_username(request)
    out = []
    for f in _call(firms.my_firms, user):
        f["portfolios"] = [{"id": p["id"], "name": p["name"], "kind": p.get("kind"), "client_name": p.get("client_name", "")}
                           for p in firms.firm_portfolios(f["id"])]
        out.append(f)
    return {"firms": out, "available": firms.db.available()}


@router.post("/")
async def create_firm(request: Request, body: FirmBody):
    return _call(firms.create, get_username(request), body.name or "")


@router.get("/invite-info")
async def invite_info(token: str):
    return _call(firms.peek_invite, token)


class TokenBody(BaseModel):
    token: str


@router.post("/accept-invite")
async def accept_invite(request: Request, body: TokenBody):
    return _call(firms.accept_invite, get_username(request), body.token)


@router.get("/{firm_id}")
async def get_firm(request: Request, firm_id: str):
    role = _call(firms.require, get_username(request), firm_id)
    f = firms.get(firm_id)
    out = {**f, "role": role}
    if role == "admin":
        cfg = sso.saml_config(firm_id)
        out["saml"] = {k: v for k, v in (cfg or {}).items() if k != "idp_cert_pem"} | (
            {"has_cert": True} if cfg else {})
        out["sp"] = {"entity_id": sso.sp_entity_id(f["slug"]), "acs_url": sso.acs_url(f["slug"]),
                     "metadata_url": sso.sp_entity_id(f["slug"])}
    return out


@router.put("/{firm_id}")
async def update_firm(request: Request, firm_id: str, body: FirmBody):
    return _call(firms.update_policy, get_username(request), firm_id, body.model_dump(exclude_none=True))


class DeleteBody(BaseModel):
    confirm_name: str


@router.post("/{firm_id}/delete")
async def delete_firm(request: Request, firm_id: str, body: DeleteBody):
    return _call(firms.delete, get_username(request), firm_id, body.confirm_name)


@router.get("/{firm_id}/members")
async def list_members(request: Request, firm_id: str):
    return {"members": _call(firms.members, get_username(request), firm_id)}


class MemberBody(BaseModel):
    role: str | None = None
    status: str | None = None


@router.put("/{firm_id}/members/{member}")
async def change_member(request: Request, firm_id: str, member: str, body: MemberBody):
    return {"members": _call(firms.set_member, get_username(request), firm_id, member, body.role, body.status)}


@router.delete("/{firm_id}/members/{member}")
async def remove_member(request: Request, firm_id: str, member: str):
    return {"members": _call(firms.remove_member, get_username(request), firm_id, member)}


class InviteBody(BaseModel):
    role: str
    email: str = ""


@router.get("/{firm_id}/invites")
async def list_invites(request: Request, firm_id: str):
    return {"invites": _call(firms.invites, get_username(request), firm_id)}


@router.post("/{firm_id}/invites")
async def create_invite(request: Request, firm_id: str, body: InviteBody):
    out = _call(firms.invite, get_username(request), firm_id, body.role, body.email)
    out["link"] = f"{sso.public_url()}/join/{out['token']}"
    return out


@router.delete("/{firm_id}/invites/{invite_id}")
async def revoke_invite(request: Request, firm_id: str, invite_id: str):
    _call(firms.revoke_invite, get_username(request), firm_id, invite_id)
    return {"revoked": invite_id}


class SamlBody(BaseModel):
    idp_entity_id: str
    idp_sso_url: str
    idp_cert: str
    email_attribute: str = ""
    enabled: bool = True


@router.put("/{firm_id}/saml")
async def put_saml(request: Request, firm_id: str, body: SamlBody):
    cfg = _call(sso.save_saml_config, get_username(request), firm_id, body.idp_entity_id, body.idp_sso_url, body.idp_cert,
                body.email_attribute, body.enabled)
    return {k: v for k, v in cfg.items() if k != "idp_cert_pem"}


class FirmPortfolioBody(BaseModel):
    name: str
    kind: str = "client"
    client_name: str = ""
    benchmark: str = "index:SPX"


@router.post("/{firm_id}/portfolios")
async def create_firm_portfolio(request: Request, firm_id: str, body: FirmPortfolioBody):
    return _call(firms.create_portfolio, get_username(request), firm_id, name=body.name, kind=body.kind,
                 client_name=body.client_name, benchmark=body.benchmark)


class TransferBody(BaseModel):
    portfolio_id: str


@router.post("/{firm_id}/transfer")
async def transfer(request: Request, firm_id: str, body: TransferBody):
    return _call(firms.transfer_portfolio, get_username(request), body.portfolio_id, firm_id)


# ── Audit trail and access review (admin, compliance) ──────────────────────

@router.get("/{firm_id}/audit")
async def firm_audit(request: Request, firm_id: str, action: str | None = None, actor: str | None = None,
                     since: str | None = None, until: str | None = None, before_id: int | None = None, limit: int = 200):
    _call(firms.require, get_username(request), firm_id, firms.AUDIT_ROLES)
    return {"events": _call(audit_events.query, firm_id=firm_id, action=action, actor=actor, since=since, until=until,
                            before_id=before_id, limit=limit)}


@router.get("/{firm_id}/audit.csv")
async def firm_audit_csv(request: Request, firm_id: str, since: str | None = None, until: str | None = None):
    user = get_username(request)
    _call(firms.require, user, firm_id, firms.AUDIT_ROLES)
    rows = _call(audit_events.query, firm_id=firm_id, since=since, until=until, limit=5000)
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["id", "time_utc", "actor", "action", "target", "ip", "detail", "hash"])
    for r in rows:
        w.writerow([r["id"], r["at"], r["actor"], r["action"], r["target"] or "", r["ip"] or "", r["detail"], r["hash"]])
    audit_events.from_request(request, "firm.audit_export", firm_id=firm_id, detail={"rows": len(rows)})
    return Response(buf.getvalue(), media_type="text/csv",
                    headers={"Content-Disposition": f'attachment; filename="audit-{firm_id}.csv"', "Cache-Control": "no-store"})


@router.post("/{firm_id}/access-review")
async def access_review(request: Request, firm_id: str):
    return {"members": _call(firms.mark_reviewed, get_username(request), firm_id)}


# Static paths must win over /{firm_id}
router.routes.sort(key=lambda r: "{firm_id}" in getattr(r, "path", ""))
