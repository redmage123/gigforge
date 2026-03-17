---
id: US-405
title: Dashboard Charts (Frontend)
epic: Epic 8 — Frontend
sprint: 2
points: 5
priority: P1
assignee: gigforge-dev-frontend
status: TODO
---

# US-405: Dashboard Charts (Frontend)

## User Story
As a sales manager, I want a visual dashboard with charts so I can understand pipeline health at a glance.

## Acceptance Criteria
- Route: / (home) — Dashboard
- KPI tiles row: Open Deals, Pipeline Value, Won This Month, Tasks Overdue
- Pipeline Funnel chart: horizontal bar chart, one bar per stage, width = deal count
- Deal Velocity chart: line chart, won vs lost deals by week (12 weeks)
- Activity Feed: last 20 activities as scrollable list with type icon, subject, contact, time ago
- Leaderboard table: top agents by deals won this month
- Use recharts library for all charts
- Charts animate on mount (500ms ease-in)
- Responsive: 2-column grid on desktop, single column on mobile
- Skeleton loaders while fetching
