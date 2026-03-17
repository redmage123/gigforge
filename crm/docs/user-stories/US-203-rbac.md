# US-203: RBAC Permission Dependency

**ID:** CRM-203
**Epic:** Epic 2 — Auth & Multi-Tenancy
**Sprint:** 1
**Assigned:** gigforge-dev-backend
**Points:** 3
**Priority:** P0
**Status:** READY (blocked by CRM-202)

---

## User Story

> As an API designer, I want a composable FastAPI dependency that enforces role-based access, so that I can protect individual endpoints with a single decorator without duplicating permission logic.

---

## Role Matrix

| Action | admin | manager | agent | viewer |
|--------|-------|---------|-------|--------|
| Read all data | ✓ | ✓ | own only | ✓ |
| Create contacts/deals | ✓ | ✓ | ✓ | — |
| Update contacts/deals | ✓ | ✓ | own only | — |
| Delete any record | ✓ | ✓ | — | — |
| Manage users | ✓ | — | — | — |
| Manage pipelines | ✓ | ✓ | — | — |
| Manage webhooks | ✓ | — | — | — |

---

## Acceptance Criteria

- [ ] `require_role(*roles)` dependency factory — usage: `Depends(require_role("admin", "manager"))`
- [ ] Insufficient role returns `403 Forbidden` with `{"detail": "Insufficient permissions"}`
- [ ] `viewer` role can `GET` all resources but `POST/PUT/PATCH/DELETE` return `403`
- [ ] `agent` role can only update/delete records where `owner_id == current_user.id`
- [ ] `admin` role bypasses all ownership checks
- [ ] Role extracted from JWT — no DB lookup needed for the check itself

---

## TDD Test Cases (write BEFORE implementing)

```
test_viewer_cannot_create_contact_returns_403
test_viewer_can_list_contacts_returns_200
test_admin_can_delete_any_contact
test_manager_can_delete_any_contact
test_agent_cannot_delete_returns_403
test_agent_can_update_own_contact
test_agent_cannot_update_other_users_contact_returns_403
test_require_role_multiple_allowed_roles
test_require_role_with_single_role
```

---

## Implementation Pattern

```python
# app/core/dependencies.py
def require_role(*allowed_roles: str):
    async def dependency(
        current_user: User = Depends(get_current_user),
    ) -> User:
        if current_user.role not in allowed_roles:
            raise HTTPException(403, detail="Insufficient permissions")
        return current_user
    return dependency

# Usage:
@router.delete("/contacts/{id}", dependencies=[Depends(require_role("admin", "manager"))])
async def delete_contact(...):
    ...
```
