# CRM Platform — Frontend

React frontend for the GigForge + TechUni CRM platform.

## Stack

- React 19
- TypeScript
- Vite 6
- Tailwind CSS (dark theme)
- TanStack Query v5
- React Router v6
- Recharts
- @dnd-kit

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_URL` | *(empty — uses same-origin nginx proxy)* | Base URL for API requests |

## Development

```bash
npm install
npm run dev        # starts dev server on http://localhost:5173
```

## Build

```bash
npm run build
```

## Tests

```bash
npm run test
npm run test:coverage
```

## Pages

- **Login** — authentication
- **Contacts** — list + detail view with search, tag filtering, and add contact modal
- **Companies** — list + detail view
- **Deal Pipeline** — Kanban board with drag-and-drop (@dnd-kit)
- **Tasks** — task management with status tracking
- **Dashboard** — 8 KPI cards, pipeline bar chart, funnel chart, recent activity feed
- **CSV Import** — bulk data import
- **Global Search** — Cmd+K spotlight search across all entities
