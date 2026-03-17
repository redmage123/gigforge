---
id: US-501
title: Sprint 2 Test Coverage ≥90%
epic: Epic QA
sprint: 2
points: 8
priority: P0
assignee: gigforge-qa
status: TODO
---

# US-501: Sprint 2 Test Coverage ≥90%

## User Story
As the team, we need test coverage of all Sprint 2 endpoints and frontend components to maintain quality.

## Acceptance Criteria
- Backend: pytest coverage ≥90% across all Sprint 2 endpoints
- All Deals/Pipeline endpoints: happy path + edge cases + tenant isolation
- All Activities/Tasks endpoints: happy path + authorization
- Notes endpoints tested
- Dashboard KPIs: tests verify correct aggregation logic
- Webhook delivery: test async background delivery, retry logic, HMAC verification
- Global search: test relevance ranking, tenant isolation
- CSV import: test happy path, duplicates, invalid rows, large file (>100 rows background job)
- Frontend: React Testing Library unit tests for all new components
- Integration test: full deal lifecycle (create → move stages → won → webhook fired)
- CI remains green throughout sprint
