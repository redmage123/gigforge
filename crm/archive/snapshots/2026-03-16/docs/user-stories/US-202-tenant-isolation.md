# US-202: Tenant Isolation Middleware

**ID:** CRM-202
**Epic:** Epic 2 — Auth & Multi-Tenancy
**Sprint:** 1
**Assigned:** gigforge-dev-backend
**Points:** 5
**Priority:** P0
**Status:** READY (blocked by CRM-201)

---

## User Story

> As a system architect, I want every database query automatically scoped to the authenticated user's tenant, so that no user can ever read or write another tenant's data regardless of URL manipulation.

---

## Acceptance Criteria

- [ ] FastAPI dependency `get_current_org_id` extracts and validates `org_id` from JWT
- [ ] All repository methods accept `org_id` as a required first parameter
- [ ] `org_id` is always the first `.where()` filter in every SQLAlchemy query
- [ ] No route can return data from a different tenant even if a valid record UUID is supplied
- [ ] Cross-tenant record access returns `404 Not Found` (not `403` — do not reveal existence)
- [ ] PostgreSQL `SET LOCAL app.tenant_id = ?` executed on every DB session (defence in depth)
- [ ] Dedicated cross-tenant test file: `tests/test_tenant_isolation.py` — runs on every CI build
- [ ] Missing or invalid JWT returns `401 Unauthorized`

---

## TDD Test Cases (write BEFORE implementing)

```
test_gigforge_user_cannot_read_techuni_contact
test_gigforge_user_cannot_update_techuni_deal
test_gigforge_user_cannot_delete_techuni_company
test_cross_tenant_id_in_url_returns_404_not_403
test_tenant_id_extracted_correctly_from_jwt
test_missing_jwt_returns_401
test_expired_jwt_returns_401
test_tampered_jwt_returns_401
```

---

## Implementation Pattern

```python
# app/core/dependencies.py
async def get_current_org_id(
    token: str = Depends(oauth2_scheme),
    session: AsyncSession = Depends(get_session),
) -> UUID:
    payload = decode_jwt(token)          # raises 401 if invalid/expired
    org_id = UUID(payload["org_id"])
    await session.execute(
        text("SET LOCAL app.tenant_id = :org_id"),
        {"org_id": str(org_id)}
    )
    return org_id

# Every route:
@router.get("/contacts/{id}")
async def get_contact(
    id: UUID,
    org_id: UUID = Depends(get_current_org_id),
    session: AsyncSession = Depends(get_session),
):
    contact = await contacts_repo.get(session, org_id, id)
    if not contact:
        raise HTTPException(404)  # never 403 — don't reveal existence
    return contact
```

---

## ADR Reference

ADR-001 — Multi-tenant strategy (row-level isolation with PostgreSQL RLS)
