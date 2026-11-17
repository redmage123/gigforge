"""Firm accounts: a firm owns portfolios; members get a role.

Roles
  admin       manage members, invitations, sign-in policy and SSO; full portfolio access
  pm          create and manage firm portfolios, log trades, cash, targets
  analyst     read all firm portfolios (no changes)
  compliance  read all firm portfolios and the firm's audit trail and access reviews
  viewer      read all firm portfolios

Firm records (portfolios, trades, cash…) are stored under the owner key "firm-<id>", so every
portfolio feature works for firm portfolios unchanged. Portfolio ids stay globally unique; the
firm_portfolios table says which firm a portfolio belongs to.
"""

import hashlib
import re
import secrets
from datetime import datetime, timedelta, timezone

from services import audit_events, db, portfolios

ROLES = ("admin", "pm", "analyst", "compliance", "viewer")
WRITE_ROLES = ("admin", "pm")
AUDIT_ROLES = ("admin", "compliance")
INVITE_DAYS = 7


class FirmError(Exception):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


def owner_key(firm_id: str) -> str:
    return f"firm-{firm_id}"


def firm_of_owner(owner: str) -> str | None:
    return owner[5:] if owner.startswith("firm-") else None


def _slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:40] or "firm"


def _row(r) -> dict:
    return {"id": r[0], "name": r[1], "slug": r[2], "created_by": r[3], "created_at": r[4].isoformat(),
            "sso_domains": list(r[5] or []), "sso_required": r[6], "default_role": r[7], "session_hours": r[8]}


FIRM_COLS = "id, name, slug, created_by, created_at, sso_domains, sso_required, default_role, session_hours"


# ── Firms ──────────────────────────────────────────────────────────────────

def create(username: str, name: str) -> dict:
    name = re.sub(r"\s+", " ", (name or "").strip())[:80]
    if len(name) < 2:
        raise FirmError("Give the firm a name")
    fid = "f" + secrets.token_hex(6)
    base = _slug(name)
    with db.conn() as c:
        slug, n = base, 1
        while c.execute("SELECT 1 FROM firms WHERE slug = %s", (slug,)).fetchone():
            n += 1
            slug = f"{base}-{n}"
        c.execute(f"INSERT INTO firms (id, name, slug, created_by) VALUES (%s, %s, %s, %s)", (fid, name, slug, username))
        c.execute("INSERT INTO firm_members (firm_id, username, role, added_by) VALUES (%s, %s, 'admin', %s)",
                  (fid, username, username))
        c.commit()
    audit_events.record(username, "firm.create", firm_id=fid, target=fid, detail={"name": name})
    return get(fid)


def get(firm_id: str) -> dict | None:
    with db.conn() as c:
        r = c.execute(f"SELECT {FIRM_COLS} FROM firms WHERE id = %s", (firm_id,)).fetchone()
    return _row(r) if r else None


def by_slug(slug: str) -> dict | None:
    with db.conn() as c:
        r = c.execute(f"SELECT {FIRM_COLS} FROM firms WHERE slug = %s", (slug,)).fetchone()
    return _row(r) if r else None


def membership(username: str, firm_id: str) -> str | None:
    """The user's active role in the firm, or None."""
    with db.conn() as c:
        r = c.execute("SELECT role FROM firm_members WHERE firm_id = %s AND username = %s AND status = 'active'",
                      (firm_id, username)).fetchone()
    return r[0] if r else None


def member_status(username: str, firm_id: str) -> str | None:
    with db.conn() as c:
        r = c.execute("SELECT status FROM firm_members WHERE firm_id = %s AND username = %s", (firm_id, username)).fetchone()
    return r[0] if r else None


def require(username: str, firm_id: str, roles=ROLES) -> str:
    role = membership(username, firm_id)
    if role is None:
        raise FirmError("Firm not found", 404)
    if role not in roles:
        raise FirmError("Your role in this firm doesn't allow that", 403)
    return role


def my_firms(username: str) -> list[dict]:
    if not db.available():
        return []
    with db.conn() as c:
        rows = c.execute(f"SELECT {', '.join('f.' + x.strip() for x in FIRM_COLS.split(','))}, m.role FROM firms f "
                         "JOIN firm_members m ON m.firm_id = f.id WHERE m.username = %s AND m.status = 'active' ORDER BY f.name",
                         (username,)).fetchall()
    return [{**_row(r[:-1]), "role": r[-1]} for r in rows]


def update_policy(username: str, firm_id: str, fields: dict) -> dict:
    require(username, firm_id, ("admin",))
    sets, args = [], []
    if "name" in fields:
        name = re.sub(r"\s+", " ", str(fields["name"] or "").strip())[:80]
        if len(name) < 2:
            raise FirmError("Give the firm a name")
        sets.append("name = %s"); args.append(name)
    if "sso_domains" in fields:
        doms = sorted({d.strip().lower().lstrip("@") for d in fields["sso_domains"] or [] if d and d.strip()})
        if any(not re.fullmatch(r"[a-z0-9-]+(\.[a-z0-9-]+)+", d) for d in doms):
            raise FirmError("Email domains look like example.com")
        sets.append("sso_domains = %s"); args.append(doms)
    if "sso_required" in fields:
        sets.append("sso_required = %s"); args.append(bool(fields["sso_required"]))
    if "default_role" in fields:
        if fields["default_role"] not in ("analyst", "viewer", "pm", "compliance"):
            raise FirmError("New SSO members can start as pm, analyst, compliance or viewer")
        sets.append("default_role = %s"); args.append(fields["default_role"])
    if "session_hours" in fields:
        h = int(fields["session_hours"])
        if not 1 <= h <= 24:
            raise FirmError("Session length must be 1 to 24 hours")
        sets.append("session_hours = %s"); args.append(h)
    if sets:
        with db.conn() as c:
            c.execute(f"UPDATE firms SET {', '.join(sets)} WHERE id = %s", (*args, firm_id))
            c.commit()
        audit_events.record(username, "firm.policy_change", firm_id=firm_id, target=firm_id,
                            detail={k: v for k, v in fields.items()})
    return get(firm_id)


def delete(username: str, firm_id: str, confirm_name: str) -> dict:
    """Delete the firm and everything it owns (portfolios, trades, cash, statements)."""
    from services import store

    require(username, firm_id, ("admin",))
    firm = get(firm_id)
    if confirm_name.strip() != firm["name"]:
        raise FirmError("Type the firm's name exactly to confirm")
    n = store.delete_owner(owner_key(firm_id))
    with db.conn() as c:
        c.execute("DELETE FROM identities WHERE provider = %s", (f"saml:{firm_id}",))
        c.execute("DELETE FROM firms WHERE id = %s", (firm_id,))
        c.commit()
    audit_events.record(username, "firm.delete", firm_id=firm_id, target=firm_id, detail={"name": firm["name"], "records": n})
    return {"deleted": firm_id, "records": n}


# ── Members and invitations ────────────────────────────────────────────────

def members(username: str, firm_id: str) -> list[dict]:
    require(username, firm_id)
    from services.auth import load_users

    info = {u["username"]: u for u in load_users()}
    with db.conn() as c:
        rows = c.execute("SELECT m.username, m.role, m.status, m.added_by, m.added_at, m.reviewed_at, "
                         "(SELECT max(last_used) FROM identities i WHERE i.username = m.username) "
                         "FROM firm_members m WHERE m.firm_id = %s ORDER BY m.role, m.username", (firm_id,)).fetchall()
    out = []
    for u, role, status, by, at, reviewed, sso_used in rows:
        rec = info.get(u, {})
        last = max(filter(None, [rec.get("last_login_at"), sso_used.isoformat() if sso_used else None]), default=None)
        out.append({"username": u, "name": " ".join(filter(None, [rec.get("first_name"), rec.get("last_name")])),
                    "role": role, "status": status, "added_by": by, "added_at": at.isoformat(),
                    "reviewed_at": reviewed.isoformat() if reviewed else None, "last_login_at": last})
    return out


def _admins(c, firm_id: str) -> int:
    return c.execute("SELECT count(*) FROM firm_members WHERE firm_id = %s AND role = 'admin' AND status = 'active'",
                     (firm_id,)).fetchone()[0]


def set_member(username: str, firm_id: str, member: str, role: str | None = None, status: str | None = None) -> list[dict]:
    require(username, firm_id, ("admin",))
    if role is not None and role not in ROLES:
        raise FirmError(f"Role must be one of {', '.join(ROLES)}")
    if status is not None and status not in ("active", "suspended"):
        raise FirmError("Status must be active or suspended")
    with db.conn() as c:
        cur = c.execute("SELECT role, status FROM firm_members WHERE firm_id = %s AND username = %s FOR UPDATE",
                        (firm_id, member)).fetchone()
        if not cur:
            raise FirmError("Not a member of this firm", 404)
        new_role, new_status = role or cur[0], status or cur[1]
        losing_admin = cur[0] == "admin" and cur[1] == "active" and (new_role != "admin" or new_status != "active")
        if losing_admin and _admins(c, firm_id) <= 1:
            raise FirmError("A firm needs at least one active admin")
        c.execute("UPDATE firm_members SET role = %s, status = %s WHERE firm_id = %s AND username = %s",
                  (new_role, new_status, firm_id, member))
        c.commit()
    audit_events.record(username, "firm.member_change", firm_id=firm_id, target=member,
                        detail={"from": {"role": cur[0], "status": cur[1]}, "to": {"role": new_role, "status": new_status}})
    return members(username, firm_id)


def remove_member(username: str, firm_id: str, member: str) -> list[dict]:
    if member != username:
        require(username, firm_id, ("admin",))
    else:
        require(username, firm_id)  # anyone can leave
    with db.conn() as c:
        cur = c.execute("SELECT role FROM firm_members WHERE firm_id = %s AND username = %s FOR UPDATE",
                        (firm_id, member)).fetchone()
        if not cur:
            raise FirmError("Not a member of this firm", 404)
        if cur[0] == "admin" and _admins(c, firm_id) <= 1:
            raise FirmError("A firm needs at least one active admin; make someone else admin first")
        c.execute("DELETE FROM firm_members WHERE firm_id = %s AND username = %s", (firm_id, member))
        c.commit()
    audit_events.record(username, "firm.member_remove", firm_id=firm_id, target=member)
    return members(username, firm_id) if member != username else []


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def invite(username: str, firm_id: str, role: str, email: str = "") -> dict:
    require(username, firm_id, ("admin",))
    if role not in ROLES:
        raise FirmError(f"Role must be one of {', '.join(ROLES)}")
    token = secrets.token_urlsafe(24)
    expires = datetime.now(timezone.utc) + timedelta(days=INVITE_DAYS)
    with db.conn() as c:
        c.execute("INSERT INTO firm_invites (token_hash, firm_id, role, email, created_by, expires_at) VALUES (%s,%s,%s,%s,%s,%s)",
                  (_hash(token), firm_id, role, (email or "").strip()[:200] or None, username, expires))
        c.commit()
    audit_events.record(username, "firm.invite_create", firm_id=firm_id, detail={"role": role, "email": email or None})
    return {"token": token, "role": role, "expires_at": expires.isoformat()}


def invites(username: str, firm_id: str) -> list[dict]:
    require(username, firm_id, ("admin",))
    with db.conn() as c:
        rows = c.execute("SELECT token_hash, role, email, created_by, created_at, expires_at, accepted_by, accepted_at, revoked_at "
                         "FROM firm_invites WHERE firm_id = %s ORDER BY created_at DESC LIMIT 100", (firm_id,)).fetchall()
    now = datetime.now(timezone.utc)
    return [{"id": r[0][:12], "role": r[1], "email": r[2], "created_by": r[3], "created_at": r[4].isoformat(),
             "expires_at": r[5].isoformat(), "accepted_by": r[6],
             "status": "accepted" if r[6] else "revoked" if r[8] else "expired" if r[5] < now else "pending"} for r in rows]


def revoke_invite(username: str, firm_id: str, invite_id: str) -> None:
    require(username, firm_id, ("admin",))
    with db.conn() as c:
        n = c.execute("UPDATE firm_invites SET revoked_at = now() WHERE firm_id = %s AND token_hash LIKE %s "
                      "AND accepted_at IS NULL AND revoked_at IS NULL", (firm_id, invite_id + "%")).rowcount
        c.commit()
    if not n:
        raise FirmError("Invitation not found", 404)
    audit_events.record(username, "firm.invite_revoke", firm_id=firm_id, target=invite_id)


def peek_invite(token: str) -> dict:
    with db.conn() as c:
        r = c.execute("SELECT i.firm_id, f.name, i.role, i.expires_at, i.accepted_at, i.revoked_at FROM firm_invites i "
                      "JOIN firms f ON f.id = i.firm_id WHERE i.token_hash = %s", (_hash(token),)).fetchone()
    if not r or r[4] or r[5] or r[3] < datetime.now(timezone.utc):
        raise FirmError("This invitation link is invalid, used or expired. Ask your firm admin for a new one.", 404)
    return {"firm_id": r[0], "firm_name": r[1], "role": r[2], "expires_at": r[3].isoformat()}


def accept_invite(username: str, token: str) -> dict:
    info = peek_invite(token)
    with db.conn() as c:
        n = c.execute("UPDATE firm_invites SET accepted_by = %s, accepted_at = now() WHERE token_hash = %s "
                      "AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now()", (username, _hash(token))).rowcount
        if not n:
            raise FirmError("This invitation was just used or revoked", 409)
        c.execute("INSERT INTO firm_members (firm_id, username, role, added_by) VALUES (%s, %s, %s, 'invitation') "
                  "ON CONFLICT (firm_id, username) DO UPDATE SET status = 'active'", (info["firm_id"], username, info["role"]))
        c.commit()
    audit_events.record(username, "firm.invite_accept", firm_id=info["firm_id"], target=username, detail={"role": info["role"]})
    return info


def add_jit_member(firm_id: str, username: str) -> str:
    """SSO just-in-time provisioning: add with the firm's default role (no-op if already a member)."""
    f = get(firm_id)
    with db.conn() as c:
        c.execute("INSERT INTO firm_members (firm_id, username, role, added_by) VALUES (%s, %s, %s, 'sso') "
                  "ON CONFLICT DO NOTHING", (firm_id, username, f["default_role"]))
        c.commit()
    audit_events.record(username, "firm.member_jit", firm_id=firm_id, target=username, detail={"role": f["default_role"]})
    return membership(username, firm_id) or f["default_role"]


def mark_reviewed(username: str, firm_id: str) -> list[dict]:
    """Access review: an admin confirms every member's access is still appropriate."""
    require(username, firm_id, ("admin",))
    with db.conn() as c:
        c.execute("UPDATE firm_members SET reviewed_at = now() WHERE firm_id = %s", (firm_id,))
        c.commit()
    snapshot = [{k: m[k] for k in ("username", "role", "status", "last_login_at")} for m in members(username, firm_id)]
    audit_events.record(username, "firm.access_review", firm_id=firm_id, detail={"members": snapshot})
    return members(username, firm_id)


# ── Firm portfolios ────────────────────────────────────────────────────────

def portfolio_firm(pid: str) -> str | None:
    if not db.available():
        return None
    with db.conn() as c:
        r = c.execute("SELECT firm_id FROM firm_portfolios WHERE portfolio_id = %s", (pid,)).fetchone()
    return r[0] if r else None


def firm_portfolios(firm_id: str) -> list[dict]:
    return portfolios.list_own(owner_key(firm_id))


def create_portfolio(username: str, firm_id: str, **fields) -> dict:
    require(username, firm_id, WRITE_ROLES)
    rec = portfolios.create(owner_key(firm_id), **fields)
    with db.conn() as c:
        c.execute("INSERT INTO firm_portfolios (portfolio_id, firm_id) VALUES (%s, %s)", (rec["id"], firm_id))
        c.commit()
    audit_events.record(username, "portfolio.create", firm_id=firm_id, target=rec["id"], detail={"name": rec["name"]})
    return rec


def transfer_portfolio(username: str, pid: str, firm_id: str) -> dict:
    """Move one of the user's own portfolios (with its trades and cash) into the firm."""
    from services import cash, store, trades

    require(username, firm_id, WRITE_ROLES)
    rec = portfolios.get_own(username, pid)
    if not rec:
        raise FirmError("Portfolio not found", 404)
    if rec.get("default"):
        raise FirmError("Your default portfolio can't move; create a new one or move trades out of it first")
    fk = owner_key(firm_id)
    mine_t = [t for t in trades.get_trades(username) if t["portfolio_id"] == pid]
    mine_c = cash.get_entries(username, [pid])
    store.update("trades", fk, lambda rows: (rows or []) + mine_t, [])
    store.update("cash", fk, lambda rows: (rows or []) + mine_c, [])
    store.update("portfolios", fk, lambda rows: (rows or []) + [{**rec, "default": False}], [])
    trades.save_trades(username, [t for t in trades.get_trades(username) if t["portfolio_id"] != pid])
    cash.reassign(username, pid, None)
    store.update("portfolios", username, lambda rows: [r for r in rows if r["id"] != pid], [])
    for key, size in store.list_blobs("statements", f"{username}/{pid}/"):
        data = store.get_blob("statements", key)
        store.put_blob("statements", f"{fk}/{pid}/{key.rsplit('/', 1)[-1]}", data, "application/pdf")
    with db.conn() as c:
        c.execute("INSERT INTO firm_portfolios (portfolio_id, firm_id) VALUES (%s, %s)", (pid, firm_id))
        c.execute("DELETE FROM blobs WHERE ns = 'statements' AND key LIKE %s", (f"{username}/{pid}/%",))
        c.commit()
    portfolios.rehome_grants(pid, fk)
    audit_events.record(username, "portfolio.transfer_to_firm", firm_id=firm_id, target=pid,
                        detail={"name": rec["name"], "trades": len(mine_t), "cash_entries": len(mine_c)})
    return rec


def recipients(owner: str, roles=WRITE_ROLES) -> list[str]:
    """Who gets notifications about an owner's portfolios (the user, or the firm's admins and PMs)."""
    fid = firm_of_owner(owner)
    if not fid:
        return [owner]
    with db.conn() as c:
        return [r[0] for r in c.execute("SELECT username FROM firm_members WHERE firm_id = %s AND status = 'active' "
                                        "AND role = ANY(%s)", (fid, list(roles)))]


def session_hours(username: str) -> int:
    """Shortest session length required by any of the user's firms (24h when none)."""
    if not db.available():
        return 24
    with db.conn() as c:
        r = c.execute("SELECT min(f.session_hours) FROM firms f JOIN firm_members m ON m.firm_id = f.id "
                      "WHERE m.username = %s AND m.status = 'active'", (username,)).fetchone()
    return int(r[0]) if r and r[0] else 24


def password_blocked_by(username: str) -> str | None:
    """Name of a firm that requires SSO for this (non-admin) member; admins keep password access as break-glass."""
    if not db.available():
        return None
    with db.conn() as c:
        r = c.execute("SELECT f.name FROM firms f JOIN firm_members m ON m.firm_id = f.id WHERE m.username = %s "
                      "AND m.status = 'active' AND f.sso_required AND m.role <> 'admin' LIMIT 1", (username,)).fetchone()
    return r[0] if r else None


def sole_admin_of(username: str) -> list[str]:
    if not db.available():
        return []
    with db.conn() as c:
        rows = c.execute("SELECT f.name FROM firms f JOIN firm_members m ON m.firm_id = f.id WHERE m.username = %s "
                         "AND m.role = 'admin' AND m.status = 'active' AND (SELECT count(*) FROM firm_members x "
                         "WHERE x.firm_id = f.id AND x.role = 'admin' AND x.status = 'active') = 1", (username,)).fetchall()
    return [r[0] for r in rows]


def forget_user(username: str) -> None:
    if not db.available():
        return
    with db.conn() as c:
        c.execute("DELETE FROM firm_members WHERE username = %s", (username,))
        c.execute("DELETE FROM identities WHERE username = %s", (username,))
        c.commit()
