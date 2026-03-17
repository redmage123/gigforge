---
id: US-315
title: Global Search API
epic: Epic 3 — Core CRM
sprint: 2
points: 3
priority: P1
assignee: gigforge-dev-backend
status: TODO
---

# US-315: Global Search API

## User Story
As a user, I want to search across all CRM entities from a single search bar so I can find anything quickly.

## Acceptance Criteria
- `GET /api/search?q={query}&types={contacts,companies,deals}&limit=10`
- Returns unified results array: [{type, id, title, subtitle, url_hint}]
- Searches contacts (first_name, last_name, email, phone), companies (name, domain), deals (title)
- Uses PostgreSQL pg_trgm trigram similarity for fuzzy matching
- Results ranked by relevance (trigram similarity score)
- Minimum query length: 2 characters
- Maximum results per type: 10 (30 total)
- Response time < 300ms
- Tenant-scoped (never returns other org's data)
