---
id: US-406
title: Global Search Bar (Frontend)
epic: Epic 8 — Frontend
sprint: 2
points: 3
priority: P2
assignee: gigforge-dev-frontend
status: TODO
---

# US-406: Global Search Bar (Frontend)

## User Story
As a user, I want a global search bar in the navigation so I can find any CRM record instantly.

## Acceptance Criteria
- Search icon in top navigation bar, always visible
- Clicking opens full-width search overlay (keyboard shortcut: Cmd/Ctrl + K)
- Typeahead search: fires after 300ms debounce, minimum 2 chars
- Results grouped by type: Contacts, Companies, Deals
- Each result shows type icon, title, subtitle (email for contacts, domain for companies, value for deals)
- Click result → navigates to detail page, closes overlay
- Esc key closes overlay
- No results state: "No results for '{query}'"
- Loading spinner during API call
