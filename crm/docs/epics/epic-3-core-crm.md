# Epic 3: Core CRM

**ID:** Epic-3
**Project:** Multi-Tenant CRM Platform
**Status:** READY (Sprint 1 partial, Sprint 2 remainder)
**Sprint Target:** Sprint 1 (CRM-301–303), Sprint 2 (CRM-304–305)
**Story Points:** 21 total (11 Sprint 1, 10 Sprint 2)
**PM:** gigforge-pm
**Lead:** gigforge-dev-backend

---

## Goal

The bread-and-butter CRM operations: contacts, companies, tags, full-text search, and custom fields — all scoped to the authenticated tenant.

---

## Stories

| ID | Title | Points | Owner | Sprint | Status |
|----|-------|--------|-------|--------|--------|
| CRM-301 | Contacts CRUD API | 5 | gigforge-dev-backend | 1 | READY (blocked by CRM-202, CRM-203) |
| CRM-302 | Companies CRUD API | 3 | gigforge-dev-backend | 1 | READY (blocked by CRM-202) |
| CRM-303 | Tags System | 3 | gigforge-dev-backend | 1 | READY (blocked by CRM-202) |
| CRM-304 | Full-Text Search | 5 | gigforge-dev-backend | 2 | TODO |
| CRM-305 | Custom Fields | 5 | gigforge-dev-backend | 2 | TODO |

---

## Acceptance Criteria (Epic Level)

- [ ] Contacts CRUD: `POST/GET/PUT/PATCH/DELETE /api/contacts` — paginated, filterable, soft-delete
- [ ] Companies CRUD: same pattern at `/api/companies`; `GET /companies/{id}/contacts` available
- [ ] Tags: tenant-scoped, unique by name (case-insensitive), many-to-many with contacts/companies/deals
- [ ] Full-text search: `GET /api/search?q=<term>` covers contacts + companies via `pg_trgm` GIN index
- [ ] Custom fields: admin-definable per tenant; enforced on create/update; returned in entity responses
- [ ] All endpoints return `404` (not `403`) for cross-tenant record access

---

## Key Endpoints (Sprint 1 scope)

```
POST   /api/contacts
GET    /api/contacts          ?page, per_page, sort_by, order, company_id, tag_ids, owner_id
GET    /api/contacts/{id}
PUT    /api/contacts/{id}
PATCH  /api/contacts/{id}
DELETE /api/contacts/{id}     (soft delete)

POST   /api/companies
GET    /api/companies
GET    /api/companies/{id}
GET    /api/companies/{id}/contacts
PUT    /api/companies/{id}
DELETE /api/companies/{id}

GET    /api/tags
POST   /api/tags
DELETE /api/tags/{id}
POST   /api/contacts/{id}/tags
DELETE /api/contacts/{id}/tags/{tag_id}
```

---

## Dependencies

- Epic 2 must be complete (auth + tenant middleware + RBAC)
