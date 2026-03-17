---
id: US-403
title: Tasks Pages (Frontend)
epic: Epic 8 — Frontend
sprint: 2
points: 5
priority: P1
assignee: gigforge-dev-frontend
status: TODO
---

# US-403: Tasks Pages (Frontend)

## User Story
As a sales agent, I want to view and manage my tasks so I can track follow-ups and actions.

## Acceptance Criteria
- Route: /tasks — task list
  - Tabs: My Tasks / All Tasks (manager+)
  - Sub-tabs: Today / This Week / Overdue / All
  - Card view: title, due date, priority badge, linked contact/deal, assignee
  - Priority badge colors: low=grey, medium=blue, high=orange, urgent=red
  - Overdue tasks highlighted in red
  - Checkbox to mark complete (calls PATCH /api/tasks/{id}/status)
  - Optimistic update on checkbox click
  - Add Task button → modal form (title, due date, priority, contact/deal link, assignee)
  - Filter by priority, assignee
  - Sort by due_date, priority, created_at
