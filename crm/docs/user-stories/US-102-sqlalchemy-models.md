# US-102: SQLAlchemy Models — Full Entity Set

**ID:** CRM-102
**Epic:** Epic 1 — Foundation
**Sprint:** 1
**Assigned:** gigforge-engineer
**Points:** 8
**Priority:** P0 (blocks all data stories)
**Status:** IN PROGRESS

---

## User Story

> As a developer, I want SQLAlchemy 2.x mapped models for all CRM entities, so that I can write type-safe queries and generate migrations from code.

---

## Entities Required

- [x] `Tenant` / `Organization` — isolation root
- [x] `User` — tenant-scoped with UserRole enum
- [x] `Company` — organisation record
- [x] `Contact` — person CRM record
- [x] `Pipeline` — named stage sequence
- [x] `PipelineStage` — ordered stage with probability %
- [x] `Deal` — opportunity linked to contact/company/stage
- [x] `DealStageHistory` — immutable stage transition audit log
- [x] `Activity` — call/email/meeting log
- [x] `Task` — assigned action item with due date
- [x] `Note` — rich text note linked to any entity
- [x] `Tag` + `ContactTag` — many-to-many tags
- [x] `Webhook` — registered event endpoint
- [x] `AuditLog` — immutable mutation log
- [ ] `CustomField` / `CustomFieldValue` — JSONB EAV pattern (pending ADR-0004)

---

## Acceptance Criteria

- [ ] All models inherit `Base` and `TimestampMixin` from `models/base.py`
- [ ] Every tenant-scoped model has `org_id` FK with `ondelete="CASCADE"`
- [ ] `org_id` is indexed on every child table (all composite indexes start with `org_id`)
- [ ] Enums defined as Python `str, Enum` classes (stored as VARCHAR in DB)
- [ ] All relationships defined (bidirectional where needed, `lazy="selectin"` for eager loads)
- [ ] `__repr__` on every model
- [ ] All models importable from `app.models` package `__init__`
- [ ] Models pass `alembic check` — no unapplied changes detected

---

## TDD Test Cases

- `test_all_models_importable_from_package`
- `test_tenant_scoped_model_has_org_id_fk`
- `test_enum_stored_as_varchar_in_db`
- `test_timestamp_mixin_sets_created_and_updated`

---

## Notes

Most models created by gigforge-engineer on 2026-03-15. CustomField/CustomFieldValue
pending ADR-0004 resolution. Schema doc: `docs/schema.md`.
