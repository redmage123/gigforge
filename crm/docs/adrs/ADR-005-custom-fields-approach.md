# ADR-005: Custom Fields Approach — Sparse EAV vs JSONB

**Status:** Accepted
**Date:** 2026-03-15
**Deciders:** gigforge-engineer, gigforge-pm

---

## Context

Admins need to define custom fields per tenant for contacts, companies, and deals without requiring schema migrations. Two approaches were evaluated:

| Approach | Description | Pros | Cons |
|----------|-------------|------|------|
| **JSONB on entity** | Store `custom_fields: {}` JSONB column directly on each entity table | Simple queries; single JOIN; easy indexing | No type enforcement at DB level; schema drift across tenants |
| **EAV (Entity-Attribute-Value)** | `custom_field_definitions` + `custom_field_values` tables; sparse typed columns | Full type enforcement; clean schema; auditable definitions | Extra JOINs; more complex queries; assembling entity requires aggregation |

---

## Decision

**Use the sparse-column EAV pattern** with two tables:

1. `custom_field_definitions` — org-scoped field definitions (name, type, required, options)
2. `custom_field_values` — polymorphic value rows with typed columns (`value_text`, `value_number`, `value_date`, `value_boolean`, `value_json`)

```sql
-- Definition (what fields exist for this org/entity_type)
custom_field_definitions (id, org_id, entity_type, field_name, field_type, is_required, options JSONB)

-- Value (actual value for a specific entity instance)
custom_field_values (id, definition_id, entity_id, value_text, value_number, value_date, value_boolean, value_json)
```

The application assembles `custom_fields: {}` in the response by joining definitions + values.

---

## Consequences

**Positive:**
- Type safety: each `field_type` maps to one typed column — no silent type coercion
- Auditable: field definitions are versioned entities with `created_at`
- Required field enforcement: validated at service layer using definition metadata
- `select` / `multi_select` options stored in definition's `options JSONB` — no schema change to add options

**Negative:**
- N+1 risk on entity list endpoints — mitigated with `selectinload` for custom field values
- Polymorphic `entity_id` (no FK enforced at DB level) — application layer enforces referential integrity
- More complex ORM queries — assembler needed to convert rows to `{field_name: value}` dict

**Mitigation:**
- `selectinload` on all entity list queries for custom field values
- Service layer validates `entity_id` belongs to correct `org_id` before write
- `CustomFieldAssembler` utility class centralises the row-to-dict transformation

---

## Schema Models

- `CustomFieldDefinition` — `backend/models/custom_field.py`
- `CustomFieldValue` — `backend/models/custom_field.py`

Implemented in Sprint 2 (CRM-305).
