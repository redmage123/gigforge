# ADR-0004: Custom Fields Approach — JSONB on Entity vs EAV Table

**Status:** ACCEPTED
**Date:** 2026-03-15
**Author:** gigforge-engineer
**Reviewed by:** gigforge-pm

---

## Context

Tenants need to define their own fields on Contacts, Companies, and Deals beyond the core schema (e.g., a lead source dropdown, a LinkedIn URL field, a contract value field). We need a mechanism to store these schema definitions and their values.

**Options:**

1. **JSONB column on entity** — store values in a `custom_fields` JSONB column on each entity table (e.g., `contacts.custom_fields`). A separate `custom_fields` definition table describes what fields exist per tenant/entity type.
2. **EAV table** — Entity-Attribute-Value: a `custom_field_values` table with rows like `(entity_type, entity_id, field_key, value_text, value_number, value_date, ...)`.
3. **PostgreSQL schema per tenant** — each tenant gets its own schema with native columns. Maximum query performance but operationally complex.

---

## Decision

**Use JSONB-on-entity for values + `custom_fields` definition table for schema.**

- `contacts.custom_fields` (JSONB) — stores values: `{"linkedin": "...", "tier": "gold"}`
- `companies.custom_fields` (JSONB) — same pattern
- `deals.custom_fields` (JSONB) — same pattern
- `custom_fields` table (already implemented as `CustomField` model) — stores the schema: which fields exist, their types, labels, validation rules, display order

Validation at write time (in the service layer, not the DB):

```python
async def validate_custom_fields(
    session: AsyncSession,
    tenant_id: UUID,
    entity_type: str,
    data: dict,
) -> None:
    definitions = await custom_field_dao.list_for_entity(tenant_id, entity_type)
    defined_keys = {d.field_key for d in definitions}
    for key in data:
        if key not in defined_keys:
            raise ValidationError(f"Unknown custom field: {key}")
    for defn in definitions:
        if defn.is_required and defn.field_key not in data:
            raise ValidationError(f"Required field missing: {defn.field_key}")
```

JSONB GIN index for searchable custom fields (applied in migration):

```sql
CREATE INDEX idx_contacts_custom_fields ON contacts USING gin(custom_fields);
```

---

## Rationale

**Why JSONB over EAV:**
- EAV is notoriously painful to query — getting all fields for one entity requires pivoting rows into columns, which is complex SQL.
- JSONB allows fetching all custom field values for an entity in a single row read — no join needed.
- PostgreSQL's JSONB GIN index supports efficient querying on specific keys.
- Simpler ORM mapping — `Contact.custom_fields` is just a dict.
- EAV scales poorly for read-heavy CRM workloads where each page load might display dozens of contacts with their custom fields.

**Why not native columns per tenant:**
- Cannot dynamically add columns in an operational system without schema migrations.
- Operationally complex — N tenants × M entities = many schemas to manage.
- Breaks the single-schema Alembic migration model.

**Known JSONB trade-offs:**
- Custom field values are not strongly typed at the DB layer — type enforcement must happen in the service layer.
- Querying across all contacts by a custom field value (e.g., "find all contacts where tier=gold") is possible with JSONB operators but less ergonomic than native SQL.
- This trade-off is acceptable: custom field filtering is a Sprint 2 feature (CRM-304/305); we do not need to optimise for it now.

---

## Consequences

- `contacts`, `companies`, and `deals` tables all have a `custom_fields JSONB` column (nullable, default null).
- The `custom_fields` definition table is the schema registry — it must be the source of truth for which fields are valid.
- The service layer (not the DAO) is responsible for validating custom field data against the schema before writes.
- Sprint 2 custom field filtering (CRM-305) should use JSONB operators: `custom_fields->>'field_key' = 'value'` with the GIN index.
- If a tenant deletes a `CustomField` definition, the values in entity JSONB columns are orphaned — the service layer must handle this gracefully (ignore unknown keys on read; warn on write).
