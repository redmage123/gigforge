# US-303: Tags System

**ID:** CRM-303
**Epic:** Epic 3 — Core CRM
**Sprint:** 1
**Assigned:** gigforge-dev-backend
**Points:** 3
**Priority:** P1
**Status:** READY (blocked by CRM-202)

---

## User Story

> As a manager, I want to create tags and apply them to contacts, companies, and deals, so that I can segment and filter records by custom categories.

---

## Endpoints

```
GET    /api/tags
POST   /api/tags                          {name, color?}
DELETE /api/tags/{id}

POST   /api/contacts/{id}/tags            {tag_ids: ["uuid1", "uuid2"]}
DELETE /api/contacts/{id}/tags/{tag_id}

POST   /api/companies/{id}/tags           {tag_ids: ["uuid1"]}
DELETE /api/companies/{id}/tags/{tag_id}
```

---

## Acceptance Criteria

- [ ] Tags are tenant-scoped; name unique per tenant (case-insensitive)
- [ ] `color` field: hex code format `#RRGGBB` or null
- [ ] `DELETE /tags/{id}` removes tag from all associated records (cascade via join tables)
- [ ] Assigning a non-existent tag ID returns `404`
- [ ] Assigning a cross-tenant tag returns `404`
- [ ] `GET /contacts?tag_ids=uuid1,uuid2` filters by tags (AND logic — contact must have ALL specified tags)
- [ ] `POST .../tags` with duplicate name in same tenant returns `409`

---

## TDD Test Cases (write BEFORE implementing)

```
test_create_tag_returns_201
test_create_tag_duplicate_name_same_tenant_returns_409
test_create_tag_same_name_different_tenant_succeeds
test_assign_tags_to_contact
test_remove_tag_from_contact
test_delete_tag_removes_from_all_contacts
test_filter_contacts_by_tag_id
test_filter_contacts_by_multiple_tag_ids_and_logic
test_cross_tenant_tag_assignment_returns_404
```
