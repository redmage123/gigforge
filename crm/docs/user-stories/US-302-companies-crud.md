# US-302: Companies CRUD API

**ID:** CRM-302
**Epic:** Epic 3 — Core CRM
**Sprint:** 1
**Assigned:** gigforge-dev-backend
**Points:** 3
**Priority:** P1
**Status:** READY (blocked by CRM-202)

---

## User Story

> As a sales rep, I want to manage company records and link contacts to companies, so that I can track relationships at the organisational level.

---

## Endpoints

```
POST   /api/companies
GET    /api/companies
GET    /api/companies/{id}
GET    /api/companies/{id}/contacts    (paginated contact list for this company)
PUT    /api/companies/{id}
PATCH  /api/companies/{id}
DELETE /api/companies/{id}
```

---

## Acceptance Criteria

- [ ] Required fields: `name`
- [ ] Optional: `domain`, `industry`, `size`, `website`, `phone`, `address` (JSONB), `notes`
- [ ] `size` values: `1-10` | `11-50` | `51-200` | `201-1000` | `1000+`
- [ ] `GET /companies/{id}/contacts` returns paginated contacts at this company (same pagination as contacts list)
- [ ] Deleting a company NULLs `company_id` on associated contacts — no cascade delete
- [ ] Duplicate `domain` within same tenant returns `409` if `domain` is provided
- [ ] Cross-tenant company ID returns `404`

---

## TDD Test Cases (write BEFORE implementing)

```
test_create_company_returns_201
test_create_company_minimal_fields
test_create_company_duplicate_domain_same_tenant_returns_409
test_list_companies_paginated
test_get_company_returns_full_detail
test_get_company_contacts_returns_associated_records
test_delete_company_nulls_contact_company_id
test_cross_tenant_company_id_returns_404
```
