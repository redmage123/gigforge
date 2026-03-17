---
id: ADR-010
title: Frontend Drag-and-Drop Library
status: accepted
date: 2026-03-16
deciders: gigforge-dev-frontend, gigforge-engineer
---

# ADR-010: Drag-and-Drop Library

## Context

US-401 requires drag-and-drop between Kanban columns for the deal pipeline. The two realistic choices are:

| Library | Status | Bundle | A11y | Touchscreen | Notes |
|---------|--------|--------|------|-------------|-------|
| **react-beautiful-dnd** | ⚠️ Unmaintained (last release 2022, open issues piling up) | ~28kb | Good | Poor | Atlassian officially unmaintained |
| **@dnd-kit/core** | ✅ Active (v6+, 2024 releases) | ~11kb core | Excellent (ARIA roles, keyboard) | Native pointer/touch sensors | Modular — import only what you need |
| **react-dnd** | Maintained but complex | ~15kb | Manual ARIA required | Needs backend adapters | Overkill for Kanban |

## Decision

**Use @dnd-kit/core + @dnd-kit/sortable** (already installed in `package.json`).

Rationale:
1. `react-beautiful-dnd` is officially unmaintained — unacceptable for a production codebase.
2. `@dnd-kit` is smaller, tree-shakeable, and ships better accessibility out of the box.
3. Already installed in the project (no new dependency needed).
4. `@dnd-kit/sortable` provides the `useSortable` hook which handles vertical list sorting within a column; `useDroppable` handles cross-column drops.
5. `PointerSensor` + `KeyboardSensor` covers desktop and touch with a single sensor array.

## Usage Pattern

```tsx
// Column: DndContext at board level, SortableContext per column, useDroppable on column wrapper
// Card: useSortable(id) for drag handle + transform animation
// Board: onDragEnd resolves source/destination column via id comparison
// Overlay: DragOverlay for ghost card that follows cursor
```

## Consequences

- `DealPipelinePage` uses `DndContext + DragOverlay` at the board level.
- Each stage column uses `SortableContext (verticalListSortingStrategy)` + `useDroppable`.
- Each deal card uses `useSortable`.
- `activationConstraint: { distance: 5 }` prevents accidental drags on click.
- Keyboard users can reorder cards with arrow keys (provided by `KeyboardSensor`).
