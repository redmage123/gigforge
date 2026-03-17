# US-105: Seed Data — GigForge + TechUni Tenants

**ID:** CRM-105
**Epic:** Epic 1 — Foundation
**Sprint:** 1
**Assigned:** gigforge-dev-backend
**Points:** 2
**Priority:** P1
**Status:** BLOCKED (waiting for CRM-102 model review sign-off)

---

## User Story

> As a developer running the system for the first time, I want a seed script that creates the GigForge and TechUni tenants with one admin user each and default pipeline stages, so that I can immediately test multi-tenancy without manual data entry.

---

## Acceptance Criteria

- [ ] Seed script at `scripts/seed.py`
- [ ] Creates org `GigForge` (slug: `gigforge`, plan: `professional`) with admin user `admin@gigforge.ai`
- [ ] Creates org `TechUni` (slug: `techuni`, plan: `standard`) with admin user `admin@techuni.ai`
- [ ] Passwords read from env vars (`GIGFORGE_ADMIN_PASSWORD`, `TECHUNI_ADMIN_PASSWORD`)
- [ ] Default pipeline stages seeded per org: Lead In → Qualified → Proposal Sent → Negotiation → Won → Lost
- [ ] AI agent users seeded for gigforge org: `gigforge-sales@agents.internal`, `gigforge-pm@agents.internal`, `gigforge-scout@agents.internal`
- [ ] Script is idempotent — safe to run twice without duplicating data
- [ ] `docker compose exec api python scripts/seed.py` completes without errors

---

## TDD Test Cases

- `test_seed_creates_two_organizations`
- `test_seed_idempotent_on_second_run`
- `test_seed_creates_pipeline_stages_per_org`
- `test_gigforge_and_techuni_orgs_are_isolated`

---

## Blocked By

CRM-102 — gigforge-engineer must complete and sign off on all models before seed script can be written.
