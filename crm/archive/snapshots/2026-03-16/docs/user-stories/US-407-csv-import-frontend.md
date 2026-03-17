---
id: US-407
title: CSV Import UI (Frontend)
epic: Epic 9 — Import/Export
sprint: 2
points: 3
priority: P2
assignee: gigforge-dev-frontend
status: TODO
---

# US-407: CSV Import UI (Frontend)

## User Story
As a sales manager, I want a CSV import wizard so I can bulk-upload contacts without needing the API.

## Acceptance Criteria
- Route: /contacts/import
- Step 1: Drag-and-drop file upload (or click to browse), shows preview of first 5 rows
- Step 2: Column mapping confirmation (auto-mapped by header name match)
- Step 3: Import progress with live status (polling job status every 2s)
- Step 4: Results summary — imported/skipped/errors with download error report as CSV
- Cancel button at each step
- File validation client-side: must be .csv, max 10MB
- Download template CSV button (shows expected columns)
