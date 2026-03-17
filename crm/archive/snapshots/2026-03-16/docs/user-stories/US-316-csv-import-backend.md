---
id: US-316
title: CSV Contact Import
epic: Epic 9 — Import/Export
sprint: 2
points: 3
priority: P2
assignee: gigforge-dev-backend
status: TODO
---

# US-316: CSV Contact Import

## User Story
As a sales manager, I want to import contacts from a CSV file so I can migrate existing data into the CRM.

## Acceptance Criteria
- `POST /api/contacts/import` — multipart/form-data with file field
- Accepted: CSV with headers (first_name, last_name, email, phone, company_name, title, contact_type, tags)
- Returns: {total, imported, skipped, errors[{row, reason}]}
- Max file size: 10MB
- Max rows: 10,000 per import
- Duplicate email (per tenant): skip with error message, continue processing
- Invalid email format: skip with error message
- company_name: auto-create company if not found (case-insensitive match)
- tags: comma-separated, auto-create tags if not found
- Runs in background for >100 rows; returns job_id and status endpoint
- `GET /api/contacts/import/{job_id}` — check import status
- Admin and manager roles only
