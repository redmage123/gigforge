# Epic 4: Pipeline & Deals

**ID:** Epic-4
**Project:** Multi-Tenant CRM Platform
**Status:** TODO (Sprint 2)
**Sprint Target:** Sprint 2
**Story Points:** 14
**PM:** gigforge-pm
**Lead:** gigforge-dev-backend

---

## Goal

Manage sales pipelines, move deals through customisable stages, and track weighted revenue with full stage history.

---

## Stories

| ID | Title | Points | Owner | Status |
|----|-------|--------|-------|--------|
| CRM-401 | Pipeline + Stage CRUD | 3 | gigforge-dev-backend | TODO |
| CRM-402 | Deals CRUD | 5 | gigforge-dev-backend | TODO (blocked by CRM-301, CRM-401) |
| CRM-403 | Stage Progression | 3 | gigforge-dev-backend | TODO (blocked by CRM-402) |
| CRM-404 | Pipeline Value & Probability | 3 | gigforge-dev-backend | TODO (blocked by CRM-402) |

---

## Acceptance Criteria (Epic Level)

- [ ] Each org has at least one pipeline (seeded by CRM-105)
- [ ] Pipelines have ordered stages with probability % and win/lost flags
- [ ] Deals linked to contact, company, pipeline stage, and owner
- [ ] Stage transitions recorded in `deal_stage_history` (immutable audit trail)
- [ ] `GET /api/pipelines/{id}/summary` returns deal counts + raw and weighted values by stage
- [ ] Moving deal to won/lost stage sets `closed_at` and status on the deal
- [ ] `agent` role can only view own deals; `manager`/`admin` see all

---

## Key Endpoints

```
POST   /api/pipelines
GET    /api/pipelines
GET    /api/pipelines/{id}
PUT    /api/pipelines/{id}
DELETE /api/pipelines/{id}
GET    /api/pipelines/{id}/summary

POST   /api/deals
GET    /api/deals             ?pipeline_id, stage_id, owner_id, tag_ids, min_value, max_value
GET    /api/deals/{id}
PUT    /api/deals/{id}
DELETE /api/deals/{id}
PATCH  /api/deals/{id}/stage  {stage_id, note?}
GET    /api/deals/{id}/history
```

---

## Pipeline Stage Seed Data (per org)

| Name | Position | Probability | Type |
|------|----------|-------------|------|
| Lead In | 1 | 10% | active |
| Qualified | 2 | 25% | active |
| Proposal Sent | 3 | 50% | active |
| Negotiation | 4 | 75% | active |
| Won | 5 | 100% | won |
| Lost | 6 | 0% | lost |

---

## Dependencies

- Epic 3 (Contacts CRUD) must be complete — deals require `contact_id`
- CRM-401 (Pipelines) must be complete before CRM-402 (Deals)
