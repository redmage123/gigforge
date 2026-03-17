---
id: US-313
title: Dashboard KPIs & Analytics API
epic: Epic 6 — Dashboard & Analytics
sprint: 2
points: 5
priority: P1
assignee: gigforge-dev-backend
status: TODO
---

# US-313: Dashboard KPIs & Analytics API

## User Story
As a sales manager, I want a dashboard API with key metrics so I can understand pipeline health at a glance.

## Acceptance Criteria
- `GET /api/dashboard/summary` — returns:
  - total_contacts, new_contacts_this_month
  - total_companies
  - open_deals_count, open_deals_value
  - won_deals_this_month_count, won_deals_this_month_value
  - tasks_overdue_count, tasks_due_today_count
  - activities_this_week_count
- `GET /api/dashboard/pipeline-funnel` — per pipeline:
  - stages[] with deal_count and total_value per stage
  - conversion_rate (deals won / total deals entered pipeline)
- `GET /api/dashboard/deal-velocity` — deals closed (won+lost) grouped by week for last 12 weeks
  - won_count, won_value, lost_count, lost_value per week
- `GET /api/dashboard/activity-feed` — last 50 activities/notes/tasks across org, newest first
- `GET /api/dashboard/leaderboard` — per agent: deals_won, revenue_closed, activities_logged (last 30 days)
- All endpoints tenant-scoped
- Response time < 500ms (use aggregation queries, not N+1)
- Results cacheable (add Cache-Control: max-age=60 header)
