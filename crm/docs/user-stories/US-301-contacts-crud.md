# US-301: Contacts CRUD API

**ID:** CRM-301
**Epic:** Epic 3 — Core CRM
**Sprint:** 1
**Assigned:** gigforge-dev-backend
**Points:** 5
**Priority:** P0
**Status:** READY (blocked by CRM-202, CRM-203)

---

## User Story

> As a sales rep, I want to create, view, update, and delete contact records — each scoped to my tenant — so that I can manage my prospect and customer list.

---

## Endpoints

```
POST   /api/contacts
GET    /api/contacts
GET    /api/contacts/{id}
PUT    /api/contacts/{id}
PATCH  /api/contacts/{id}
DELETE /api/contacts/{id}   (soft delete — sets deleted_at)
```

---

## Acceptance Criteria

- [ ] All endpoints require valid JWT; all queries scoped to `org_id`
- [ ] `POST` required fields: `first_name` OR `last_name` (at least one), `email` (unique per tenant)
- [ ] `GET /contacts` paginated: `page` + `per_page` (default 20, max 100)
- [ ] `GET /contacts` sortable: `sort_by` (created_at, last_name, email) + `order` (asc/desc)
- [ ] Filter params: `company_id`, `tag_ids`, `owner_id`, `contact_type`, `status`, `created_after`, `created_before`
- [ ] Response includes nested: `company.name`, `owner.name`, `tags[]`
- [ ] Soft delete: `GET /contacts` excludes deleted by default; `?include_deleted=true` shows all
- [ ] `PUT` on non-existent or cross-tenant contact returns `404`
- [ ] `contact_type` values: `lead` | `customer` | `partner` | `prospect`
- [ ] `status` values: `active` | `inactive` | `archived`

---

## TDD Test Cases (write BEFORE implementing)

```
test_create_contact_returns_201_with_id
test_create_contact_missing_name_returns_422
test_create_contact_duplicate_email_same_tenant_returns_409
test_create_contact_duplicate_email_different_tenant_succeeds
test_list_contacts_default_pagination
test_list_contacts_filtered_by_company_id
test_list_contacts_filtered_by_tag_id
test_list_contacts_scoped_to_tenant
test_get_contact_returns_nested_company_and_tags
test_update_contact_returns_200
test_patch_contact_partial_update
test_delete_contact_soft_deletes_and_hidden_from_list
test_deleted_contact_visible_with_include_deleted_param
test_cross_tenant_contact_id_returns_404
test_viewer_can_list_contacts
test_viewer_cannot_create_contact_returns_403
```

---

## Response Schema

```json
{
  "id": "uuid",
  "org_id": "uuid",
  "first_name": "Jane",
  "last_name": "Smith",
  "email": "jane@example.com",
  "phone": "+1-555-0100",
  "contact_type": "lead",
  "status": "active",
  "source": "upwork",
  "company": { "id": "uuid", "name": "Acme Corp" },
  "owner": { "id": "uuid", "name": "Bob Sales" },
  "tags": [{ "id": "uuid", "name": "hot-lead", "color": "#F59E0B" }],
  "created_at": "2026-03-15T12:00:00Z",
  "updated_at": "2026-03-15T12:00:00Z"
}
```
