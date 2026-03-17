# Approval Gate Decision — CRM Platform Sprint 1

**Date:** 2026-03-16
**Review cycle:** 1st

---

## Sign-Offs

| Reviewer | Verdict | Score | Date |
|----------|---------|-------|------|
| QA Engineer (gigforge-qa) | APPROVED | 206 tests, 0 failures, 96.46% coverage | 2026-03-15 |
| Client Advocate (gigforge-advocate) | REJECTED | 13/25 | 2026-03-16 |

---

## Gate Decision: RETURN TO DEV

QA approved. Client Advocate rejected (13/25, threshold is 18/25).

Sprint 1 cannot close. Deliverable returns to the dev team.

---

## Issues to Fix (from Client Advocate)

### Blockers
1. **Hardcoded API URL** — `frontend/src/api/client.ts` line 1 has `http://127.0.0.1:8070`; must be env-driven or relative so the app works with docker-compose.
2. **Frontend missing from `docker-compose.yml`** — `make up` starts no frontend. Add frontend service to main compose.
3. **Nginx proxy / backend routing mismatch** — nginx only proxies `/api/` but `/auth`, `/contacts`, `/tags` are at root; auth flow is broken in production. Standardise routing.
4. **Makefile service names broken** — `migrate`, `test-backend`, `shell-db` target services named `backend`/`postgres` which don't exist (compose uses `api`/`db`).

### Significant
5. **No Add Contact UI** — Contacts page has no create path; CRUD acceptance criterion fails in the frontend.
6. **Dashboard shows 4 KPIs, brief requires 8** — add weighted pipeline value, avg deal size, open tasks count, and one more metric per SRS.

### Minor
7. **Frontend README is unmodified Vite boilerplate** — replace with project-specific documentation.
8. **Login tenant slug UX** — "Workspace (tenant slug)" field label is jargon; replace with a user-friendly workspace dropdown or clearer label.

---

## Re-Review Protocol

1. Dev team addresses ALL items above.
2. Quality Reviewer re-checks (Step 5).
3. Approval Gate runs again IN FULL — both QA Engineer and Client Advocate do complete re-reviews.

---

## Sign-Off

- [x] QA Engineer approves — APPROVED (2026-03-15)
- [ ] Client Advocate approves — REJECTED (2026-03-16) — awaiting fixes
