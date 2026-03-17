---
id: US-404
title: Activity Timeline (Frontend)
epic: Epic 8 — Frontend
sprint: 2
points: 3
priority: P1
assignee: gigforge-dev-frontend
status: TODO
---

# US-404: Activity Timeline (Frontend)

## User Story
As a user, I want to see a chronological timeline of all activities on a contact or deal so I can review the full history.

## Acceptance Criteria
- Reusable Timeline component usable in Contact detail, Deal detail, Company detail
- Each timeline entry shows: icon (by type), subject/title, body excerpt, date, user avatar
- Activity types have distinct icons: phone=📞 email=✉️ meeting=📅 note=📝 demo=🖥️ other=●
- Stage change events show: "moved from X to Y" in timeline
- Load more button (pagination, 20 per page)
- Empty state: "No activities yet. Log the first one."
- Add Activity button inline in timeline → quick-log modal
