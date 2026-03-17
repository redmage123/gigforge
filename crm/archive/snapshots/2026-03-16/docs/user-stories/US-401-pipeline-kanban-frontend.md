---
id: US-401
title: Deal Pipeline Kanban Board (Frontend)
epic: Epic 8 — Frontend
sprint: 2
points: 8
priority: P0
assignee: gigforge-dev-frontend
status: TODO
---

# US-401: Deal Pipeline Kanban Board (Frontend)

## User Story
As a sales agent, I want a visual Kanban board showing deals in pipeline stages so I can see and manage my pipeline at a glance.

## Acceptance Criteria
- Route: /pipeline
- Columns: one per pipeline stage, showing stage name and total deal value
- Deal cards show: title, contact name, value, close date, owner avatar
- Drag-and-drop between columns (react-dnd or @dnd-kit/core)
- Dropping on a column calls PATCH /api/deals/{id}/stage
- Optimistic update on drag: card moves immediately, reverts on error
- Click deal card → deal detail side panel (title, contact, value, stage, activities, tasks, notes)
- Add deal button in column header → modal form
- Won/Lost buttons in deal detail → calls PATCH, moves deal off board
- Color-coded deal cards by close date proximity (green / amber / red)
- Responsive: columns scroll horizontally on mobile
- Pipeline selector dropdown if multiple pipelines exist

## Notes
- Use @dnd-kit/core (preferred over react-beautiful-dnd which is unmaintained)
- Deal detail side panel slides in from right (no full page navigation)
