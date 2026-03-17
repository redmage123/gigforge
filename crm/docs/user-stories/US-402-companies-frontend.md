---
id: US-402
title: Companies Pages (Frontend)
epic: Epic 8 — Frontend
sprint: 2
points: 5
priority: P1
assignee: gigforge-dev-frontend
status: TODO
---

# US-402: Companies Pages (Frontend)

## User Story
As a user, I want to view and manage companies so I can track organizational relationships.

## Acceptance Criteria
- Route: /companies — companies list page
  - Table: name, industry, size, domain, contact_count, created_at
  - Sortable columns, pagination
  - Search by name
  - Add Company button → modal form
- Route: /companies/{id} — company detail page
  - Header: name, domain, industry, size, website, phone
  - Tabs: Contacts, Deals, Activities, Notes
  - Contacts tab: list of linked contacts with link to contact detail
  - Deals tab: list of deals linked to company
  - Activities tab: chronological activity timeline
  - Notes tab: notes list + add note form
  - Edit company button → inline edit form
