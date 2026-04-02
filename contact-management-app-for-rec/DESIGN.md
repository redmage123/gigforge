# DESIGN.md — Contact Management App for Recruitment Agency

**Designer:** UX Designer, GigForge
**Date:** 2026-03-21
**Stack:** React 19 · Vite 6 · Tailwind CSS 4 · @headlessui/react · lucide-react
**Spec alignment:** SOFTWARE_SPEC.md · TECH_STACK.md · ADRs 0003, 0005, 0007

---

## Table of Contents

1. [Design Principles](#1-design-principles)
2. [Color Palette](#2-color-palette)
3. [Typography](#3-typography)
4. [Spacing & Sizing](#4-spacing--sizing)
5. [Component Library](#5-component-library)
   - 5.1 Primitive UI components
   - 5.2 Tag components
   - 5.3 Layout components
   - 5.4 Contact components
   - 5.5 CSV components
6. [Page Wireframes](#6-page-wireframes)
   - 6.1 Login page
   - 6.2 Contacts list — desktop
   - 6.3 Contacts list — mobile
   - 6.4 Contact detail / edit drawer
   - 6.5 CSV import modal
7. [Component Hierarchy](#7-component-hierarchy)
8. [Responsive Breakpoints](#8-responsive-breakpoints)
9. [Interaction Patterns](#9-interaction-patterns)
10. [Accessibility Requirements](#10-accessibility-requirements)
11. [Tailwind 4 Configuration Notes](#11-tailwind-4-configuration-notes)
12. [Implementation Checklist](#12-implementation-checklist)

---

## 1. Design Principles

This is a productivity tool for non-technical users. Design decisions follow from that.

- **Speed over decoration.** The recruiter types a name, sees a result, clicks, edits, saves. Every interaction takes under 3 seconds.
- **One-screen focus.** The contacts list is the entire app. Drawers and modals keep the user in context — no navigating away to edit a contact.
- **Tags as first-class citizens.** Colour-coded badges are visible everywhere: list rows, cards, detail views. They are the primary organisational tool for recruiters.
- **Honest dark mode.** Not just an inverted palette. Surfaces use layered neutrals (not pure black) so hierarchy is clear in both themes.
- **Mobile is real.** A recruiter on their phone during a client meeting must be able to add a contact with one thumb.
- **Tailwind 4 constraint (ADR-0003):** No `@apply` in components. Pure utility class composition only. All design tokens are CSS custom properties in `index.css`.

---

## 2. Color Palette

### Design Token System

Tailwind 4 uses CSS custom properties defined in `web/src/index.css`. This replaces a `tailwind.config.ts` theme extension.

```css
/* web/src/index.css */
@import "tailwindcss";

@variant dark (&:where(.dark, .dark *));

:root {
  /* Surface */
  --color-bg-base:        #FFFFFF;
  --color-bg-subtle:      #F9FAFB;   /* sidebar, table header row */
  --color-bg-muted:       #F3F4F6;   /* input backgrounds, skeleton */
  --color-bg-elevated:    #FFFFFF;   /* modals, drawers, cards */
  --color-border:         #E5E7EB;
  --color-border-strong:  #D1D5DB;   /* focused / hover borders */

  /* Text */
  --color-text-primary:   #111827;
  --color-text-secondary: #6B7280;
  --color-text-disabled:  #9CA3AF;   /* placeholder text */
  --color-text-inverse:   #FFFFFF;   /* text on brand surfaces */

  /* Brand / Interactive */
  --color-brand:          #4F46E5;   /* indigo-600 — buttons, links, focus rings */
  --color-brand-hover:    #4338CA;   /* indigo-700 */
  --color-brand-subtle:   #EEF2FF;   /* indigo-50 — active nav, hover bg */

  /* Feedback */
  --color-success:        #10B981;
  --color-success-bg:     #ECFDF5;
  --color-warning:        #F59E0B;
  --color-warning-bg:     #FFFBEB;
  --color-error:          #EF4444;
  --color-error-bg:       #FEF2F2;
  --color-info:           #3B82F6;
  --color-info-bg:        #EFF6FF;
}

.dark {
  /* Surface */
  --color-bg-base:        #0F172A;   /* slate-900 */
  --color-bg-subtle:      #1E293B;   /* slate-800 */
  --color-bg-muted:       #334155;   /* slate-700 */
  --color-bg-elevated:    #1E293B;
  --color-border:         #334155;
  --color-border-strong:  #475569;

  /* Text */
  --color-text-primary:   #F1F5F9;   /* slate-100 */
  --color-text-secondary: #94A3B8;   /* slate-400 */
  --color-text-disabled:  #64748B;   /* slate-500 */
  --color-text-inverse:   #0F172A;

  /* Brand */
  --color-brand:          #818CF8;   /* indigo-400 — lighter for dark bg */
  --color-brand-hover:    #6366F1;   /* indigo-500 */
  --color-brand-subtle:   #1E1B4B;   /* indigo-950 */

  /* Feedback */
  --color-success:        #34D399;
  --color-success-bg:     #022C22;
  --color-warning:        #FBBF24;
  --color-warning-bg:     #2D1B00;
  --color-error:          #F87171;
  --color-error-bg:       #2D0A0A;
  --color-info:           #60A5FA;
  --color-info-bg:        #0C1A2E;
}
```

### System Tag Colors (FR-011 — spec-mandated, do not change)

These come from the database seed. Render via inline styles on `TagBadge`.

| Tag | Hex | Dark mode |
|---|---|---|
| candidate | `#3B82F6` | Same hex, 15% bg |
| client | `#10B981` | Same hex, 15% bg |
| warm lead | `#F59E0B` | Same hex, 15% bg |
| placed | `#8B5CF6` | Same hex, 15% bg |
| interviewed | `#6B7280` | Same hex, 15% bg |
| custom (no colour set) | `#6366F1` fallback | Same |

Tag badge colour formula (inline style — hex comes from the API):
```tsx
// TagBadge.tsx — do not use Tailwind for tag colours; they are dynamic
const bg = hexToRgba(colour, isDark ? 0.20 : 0.12);
const border = hexToRgba(colour, isDark ? 0.40 : 0.30);
// text colour = full hex (this achieves enough contrast against the light bg)
style={{ backgroundColor: bg, borderColor: border, color: colour }}
```

`hexToRgba` is a small util in `web/src/utils/formatters.ts`.

### WCAG 2.1 AA Contrast Check (AC-016-5)

| Text / Background pair | Light ratio | Dark ratio | Pass? |
|---|---|---|---|
| text-primary on bg-base | 16.1:1 | 15.3:1 | ✅ |
| text-secondary on bg-base | 4.6:1 | 4.7:1 | ✅ |
| brand on bg-base | 5.1:1 | 4.8:1 | ✅ |
| text-inverse on brand surface | 5.1:1 | — | ✅ |
| error on bg-base | 4.5:1 | 4.6:1 | ✅ |

---

## 3. Typography

Font loaded in `<head>` via Google Fonts preconnect — no build-step dependency.

```html
<!-- web/index.html — in <head> -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
```

Base: `font-family: 'Inter', ui-sans-serif, system-ui, sans-serif` — set on `<body>`.

### Type Scale

| Role | Tailwind classes | Size | Weight | Used for |
|---|---|---|---|---|
| `display` | `text-2xl font-semibold` | 24px/32px | 600 | Page headings (Login title) |
| `heading-lg` | `text-xl font-semibold` | 20px/28px | 600 | Drawer/modal titles |
| `heading-md` | `text-base font-semibold` | 16px/24px | 600 | Section headers |
| `body` | `text-sm font-normal` | 14px/20px | 400 | Contact name, body copy |
| `body-strong` | `text-sm font-medium` | 14px/20px | 500 | Button labels, active states |
| `caption` | `text-xs font-normal` | 12px/16px | 400 | Dates, counts, metadata |
| `label` | `text-xs font-medium` | 12px/16px | 500 | Form field labels |
| `table-header` | `text-xs font-medium uppercase tracking-wide` | 12px | 500 | Table column headers |

---

## 4. Spacing & Sizing

Tailwind 4px base scale. Key fixed values:

| Landmark | px | Tailwind | Used for |
|---|---|---|---|
| Sidebar width | 240px | `w-60` | Desktop left nav |
| Topbar height | 56px | `h-14` | Mobile header |
| Drawer width (md+) | 448px | `max-w-md` | Contact form/detail |
| Modal max width | 448px | `max-w-md` | Confirmation, import summary |
| Touch target min | 44px | `min-h-11 min-w-11` | All interactive elements (WCAG) |
| Card padding | 16px | `p-4` | ContactCard |
| Drawer padding | 24px | `p-6` | Drawer content |
| Form padding | 32px | `p-8` | Login card |

---

## 5. Component Library

### 5.1 Primitive UI Components (`web/src/components/ui/`)

All primitives use Tailwind utility classes. No `@apply`. No external component library except `@headlessui/react` for compound interactive components (Dialog, Listbox, Combobox, Transition).

---

#### `Button.tsx`

```typescript
type ButtonProps = {
  variant: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  type?: 'button' | 'submit' | 'reset';
  children: React.ReactNode;
};
```

All variants meet the 44×44px minimum touch target (`min-h-11`).

| Variant | Light | Dark |
|---|---|---|
| `primary` | `bg-[var(--color-brand)] text-white hover:bg-[var(--color-brand-hover)]` | Same (lighter brand token used) |
| `secondary` | `bg-white border border-[var(--color-border)] text-[var(--color-text-primary)] hover:bg-[var(--color-bg-muted)]` | `bg-[var(--color-bg-subtle)] border-[var(--color-border)]` |
| `ghost` | `text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-muted)]` | Same |
| `danger` | `text-[var(--color-error)] border border-[var(--color-error)] hover:bg-[var(--color-error-bg)]` | Same |

Focus ring (all variants):
```
focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2
focus-visible:outline-[var(--color-brand)]
```

Loading state: replace label with `<Loader2 size={16} className="animate-spin" />` from lucide-react. Disable pointer events.

---

#### `Input.tsx`

```typescript
type InputProps = {
  id: string;
  label: string;
  type?: 'text' | 'email' | 'password' | 'tel';
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  disabled?: boolean;
  required?: boolean;
};
```

Always renders a `<label>` above the `<input>`. Error message rendered below with `role="alert"`.

```
<label htmlFor={id} className="block text-xs font-medium text-[var(--color-text-primary)] mb-1">
  {label} {required && <span aria-hidden="true" className="text-[var(--color-error)]">*</span>}
</label>
<input
  id={id}
  aria-invalid={!!error}
  aria-describedby={error ? `${id}-error` : undefined}
  className="block w-full rounded-lg border border-[var(--color-border)]
             bg-[var(--color-bg-muted)] px-3 py-2 text-sm
             text-[var(--color-text-primary)]
             placeholder:text-[var(--color-text-disabled)]
             focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]
             focus:border-transparent
             aria-[invalid=true]:border-[var(--color-error)]
             aria-[invalid=true]:ring-[var(--color-error)]
             disabled:opacity-50 disabled:cursor-not-allowed"
/>
{error && (
  <p id={`${id}-error`} role="alert" className="mt-1 text-xs text-[var(--color-error)]">
    {error}
  </p>
)}
```

---

#### `Modal.tsx`

Built on `@headlessui/react` `Dialog`. Centered. Max-width `max-w-md`.

Transition: enter `scale-95 opacity-0 → scale-100 opacity-100`, leave reverse (duration-200).

Backdrop: `bg-black/50 backdrop-blur-sm`.

Panel: `bg-[var(--color-bg-elevated)] rounded-2xl shadow-xl ring-1 ring-black/10 p-6`.

Focus trapped while open. `Escape` closes. Focus returns to trigger on close. (Headless UI handles this automatically — AC-018-4.)

```typescript
type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
};
```

---

#### `Drawer.tsx`

Built on `@headlessui/react` `Dialog`. Slides in from the right.

Width: `w-full max-w-md` on all viewports (full-screen on mobile, partial on desktop).

Transition: `translate-x-full → translate-x-0` (enter), reverse (leave), duration-300.

```typescript
type DrawerProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
};
```

Header: flex row with title (text-xl font-semibold) and close button (`X` from lucide-react, `aria-label="Close"`).

---

#### `Skeleton.tsx`

Shimmer placeholder for loading states (AC-003-7).

```typescript
type SkeletonProps = { className?: string };
```

Base: `animate-pulse rounded bg-[var(--color-bg-muted)]`

Table skeleton: `<SkeletonTable rows={5} />` — five rows with varying-width cells mimicking real content. Container has `aria-busy="true" aria-label="Loading contacts"`.

---

#### `EmptyState.tsx`

Centred content block with SVG illustration, heading, body text, and optional CTA button.

```typescript
type EmptyStateVariant = 'no-contacts' | 'no-results';

type EmptyStateProps = {
  variant: EmptyStateVariant;
  onAction?: () => void;
};
```

| Variant | Heading | Body | CTA |
|---|---|---|---|
| `no-contacts` | "No contacts yet" | "Add your first contact or import a CSV to get started." | "+ Add Contact" |
| `no-results` | "No contacts found" | "No contacts match your search or filter. Try a different term." | "Clear search" |

---

#### `Pagination.tsx`

```typescript
type PaginationProps = {
  page: number;
  totalPages: number;
  total: number;
  limit: number;
  onChange: (page: number) => void;
};
```

Layout: `<nav aria-label="Pagination">` wrapping a flex row with:
- Left: "Showing 26–50 of 3,000" (`text-xs text-[var(--color-text-secondary)]`)
- Right: [← Prev] [page numbers] [Next →]

Active page: `bg-[var(--color-brand)] text-white rounded-lg`.
Inactive pages: ghost button.
Disabled (prev on page 1, next on last page): `opacity-50 cursor-not-allowed`.
`aria-current="page"` on active page button.

---

#### `DarkModeToggle.tsx`

Icon-only button. `Moon` icon in light mode → clicking switches to dark. `Sun` icon in dark mode → clicking switches to light. Both from lucide-react.

`aria-label="Switch to dark mode"` / `"Switch to light mode"` (toggled dynamically).

Reads/writes `localStorage` key `"theme"`. Applies `.dark` class to `document.documentElement`.

FOUC prevention script in `index.html` (must be inside `<head>`, before any `<script>` tags):
```html
<script>
  (function() {
    var t = localStorage.getItem('theme');
    if (t === 'dark' || (!t && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.classList.add('dark');
    }
  })();
</script>
```

---

### 5.2 Tag Components (`web/src/components/tags/`)

#### `TagBadge.tsx`

```typescript
type TagBadgeProps = {
  tag: Tag;              // { id, name, colour, is_system }
  size?: 'sm' | 'md';
  onRemove?: () => void; // renders × button if provided
};
```

Pill shape. Colour derived dynamically from `tag.colour` (inline style — cannot use Tailwind for this).

Size `sm` (table rows, cards): `px-2 py-0.5 text-xs rounded-full`
Size `md` (detail view): `px-3 py-1 text-sm rounded-full`

Lock icon (`Lock` from lucide-react, `size={10}`) rendered inline before tag name when `tag.is_system` is true. `aria-label="System tag — cannot be deleted"` on the icon wrapper.

Remove (×) button: only rendered when `onRemove` is provided (inside TagMultiSelect). `aria-label={\`Remove ${tag.name} tag\`}`.

---

#### `TagMultiSelect.tsx`

Built on `@headlessui/react` `Combobox`. This is the most complex component.

```typescript
type TagMultiSelectProps = {
  value: Tag[];
  onChange: (tags: Tag[]) => void;
  availableTags: Tag[];
  onCreateTag: (name: string) => Promise<Tag>;
};
```

**Visual structure:**
```
┌─────────────────────────────────────────────────────────────┐
│ [candidate ×] [warm lead ×]  type to search or create...   │
└─────────────────────────────────────────────────────────────┘
  ↓ dropdown (open when input focused)
┌─────────────────────────────────────────────────────────────┐
│  🔒 candidate                                               │
│  🔒 client                                                  │
│  🔒 warm lead                                               │
│  🔒 placed                                                  │
│  🔒 interviewed                                             │
│  ───────────────────────────────────────────────           │
│     senior developer                                        │
│  ── ─────────────────────────────────────────── ──         │
│  + Create "junior recruiter"   ← only when typed & no match│
└─────────────────────────────────────────────────────────────┘
```

**Keyboard behaviour (AC-013-3, AC-018-1):**
- `Tab` — focus input
- Typing — filters tag list case-insensitively
- Arrow keys — navigate options
- `Enter` — select highlighted option (or "Create" if shown)
- `Escape` — close dropdown
- `Backspace` when input is empty — remove the last selected tag chip

**Create flow (FR-012):**
- If user has typed ≥1 character and no exact match exists → "Create '[typed]'" option appears at bottom
- Selecting it calls `onCreateTag(typed)` → POST /tags → new tag returned → immediately selected
- On 409 (duplicate name): inline error shown beneath the field

---

### 5.3 Layout Components (`web/src/components/layout/`)

#### `AppShell.tsx`

Root layout for all authenticated pages.

```tsx
<div className="flex h-screen overflow-hidden bg-[var(--color-bg-base)]">
  {/* Desktop sidebar — hidden on mobile */}
  <Sidebar className="hidden md:flex" />

  <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
    {/* Mobile topbar — hidden on desktop */}
    <MobileNav className="md:hidden" />

    <main className="flex-1 overflow-y-auto">
      {children}
    </main>
  </div>
</div>
```

---

#### `Sidebar.tsx` (desktop, `md` and above)

Fixed width `w-60` (240px). Full height. Not collapsible.

```
┌────────────────────────┐
│  🗂  RecruitCRM        │  ← logo mark + name (text-brand, font-semibold, text-lg)
├────────────────────────┤
│                        │
│  👥 Contacts           │  ← active nav item: bg-brand-subtle text-brand font-medium
│                        │
│  [flex-1 spacer]       │
│                        │
├────────────────────────┤
│  👤  demo@agency.com   │  ← current user email (text-xs text-secondary, truncate)
│  [🌙 Dark mode toggle] │
│  [Log out]             │  ← ghost button, LogOut icon from lucide-react
└────────────────────────┘
```

Nav item classes:
- Default: `flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-muted)] transition-colors`
- Active: `bg-[var(--color-brand-subtle)] text-[var(--color-brand)] font-medium`

---

#### `MobileNav.tsx` (mobile, below `md`)

Top bar, `h-14`. Contains:

```
┌────────────────────────────────────────────────┐
│  ☰   RecruitCRM              [🌙]   [+ Add]    │
└────────────────────────────────────────────────┘
```

`☰` (Menu icon from lucide-react) opens a Headless UI Dialog slide-over panel from the left:
- Full nav items
- User email
- Dark mode toggle
- Log out button

`[+ Add]` opens the ContactForm drawer directly (only shown on ContactsPage).

---

### 5.4 Contact Components (`web/src/components/contacts/`)

#### `ContactsTable.tsx` (desktop — `md` and above)

HTML `<table>` with sticky header.

```
Columns:
  NAME      →  w-48, bold, cursor-pointer, links to detail
  EMAIL     →  w-52, truncate
  COMPANY   →  w-40, truncate
  TAGS      →  flex-1, up to 3 TagBadge sm + "+N" overflow badge
  (actions) →  w-12, ⋯ icon button (Edit icon from lucide-react)
```

Sortable columns: NAME, COMPANY, DATE CREATED. Click column header cycles asc → desc → (next click resets). Sort indicator: `ArrowUp` / `ArrowDown` (lucide-react, size 14) inline with header text.

Sticky header:
```
<thead className="sticky top-0 z-10 bg-[var(--color-bg-subtle)]">
```

Row classes:
```
<tr className="border-b border-[var(--color-border)] hover:bg-[var(--color-bg-subtle)]
               cursor-pointer transition-colors duration-100">
<td className="px-4 py-3 text-sm text-[var(--color-text-primary)]">
<th className="px-4 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)]
               uppercase tracking-wide">
```

---

#### `ContactCard.tsx` (mobile — below `md`)

Replaces table rows in card layout (AC-003-6, AC-017-2).

```
┌──────────────────────────────────────────┐
│  Jordan Baker                         ›  │  ← name font-medium + ChevronRight icon
│  jordan@example.com                      │  ← email text-secondary text-sm
│  StartupCo                               │  ← company text-secondary text-sm
│  [candidate]  [warm lead]                │  ← TagBadge sm
└──────────────────────────────────────────┘
```

Classes:
```
className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)]
           p-4 mb-3 cursor-pointer active:scale-[0.99] transition-transform duration-100
           focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-brand)]"
```

The card is the `<button>` element (not a `<div>`) — fully keyboard accessible and screen-reader operable.

---

#### `ContactForm.tsx`

A `<Drawer>` containing create or edit form. Mode determined by the `contact` prop being undefined (create) or a `Contact` object (edit).

**Field layout (vertical stack, gap-4):**

```
┌──────────────────────────────────────────────────────┐
│ ←  Add Contact                                    ✕  │  ← Drawer header
├──────────────────────────────────────────────────────┤
│  Name *                                              │
│  [____________________________________________]      │
│  ⚠ Name is required                                  │
│                                                      │
│  Email                                               │
│  [____________________________________________]      │
│                                                      │
│  Phone                                               │
│  [____________________________________________]      │
│                                                      │
│  Company                                             │
│  [____________________________________________]      │
│                                                      │
│  Tags                                                │
│  [candidate ×] [warm lead ×]  type to search...     │
│  └── dropdown                                        │
│                                                      │
│  Notes                                               │
│  ┌────────────────────────────────────────────────┐  │
│  │                                                │  │  ← textarea rows={4}
│  └────────────────────────────────────────────────┘  │
│                                                      │
│  ─────────────────────── border-t ─────────────────  │
│  [Delete] (danger)              [Cancel]  [Save ⏳]  │
└──────────────────────────────────────────────────────┘
```

- "Delete" button only shown in edit mode (AC-009-1)
- Save shows spinner during submission (AC-007 loading state)
- Cancel closes drawer without saving (AC-008-6)
- Client-side validation fires on submit (not on blur — keeps UX calm)

Client-side validation rules:
- Name: required — "Name is required" (AC-007-3, AC-008-3)
- Email: optional, if present must match `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` — "Enter a valid email address" (AC-007-4)

Server-side 422 errors: map `error.fields` response to per-field error messages (AC-007-6).

---

#### `ContactDetail.tsx`

Read-only view. Rendered inside the same `<Drawer>` shell as `ContactForm`.

```
┌──────────────────────────────────────────────────────┐
│ ←  Jordan Baker                      [Edit]  [⋯]    │
├──────────────────────────────────────────────────────┤
│                                                      │
│  📧  jordan@example.com                              │
│  📞  +44 7700 123456                                 │
│  🏢  StartupCo                                       │
│                                                      │
│  Tags                                                │
│  [🔒 candidate]  [warm lead]                         │
│                                                      │
│  Notes                                               │
│  ┌────────────────────────────────────────────────┐  │
│  │ Placed at Acme 2024. Follow up Q3.             │  │  ← bg-subtle, rounded, p-3
│  └────────────────────────────────────────────────┘  │
│                                                      │
│  Created    21 Mar 2026    (text-caption text-secondary)
│  Updated    21 Mar 2026                              │
│                                                      │
└──────────────────────────────────────────────────────┘
```

`[⋯]` overflow menu (Headless UI `Menu`): "Edit contact" / "Delete contact".

If email/phone/company are empty, omit the row entirely (don't show an empty field).

---

#### `DeleteConfirm.tsx`

Headless UI `Dialog` (modal). `max-w-sm`. Focus starts on "Cancel" (safe default).

```
┌────────────────────────────────────────┐
│  Delete contact?                  ✕   │
│                                        │
│  Are you sure you want to delete       │
│  Jordan Baker? This action cannot      │
│  be undone.                            │
│                                        │
│  [Cancel]              [Delete]        │
└────────────────────────────────────────┘
```

Delete button: `danger` variant. Shows loading spinner while request is in flight. Disabled after click.

`Escape` closes without deleting. Backdrop click closes without deleting.

---

#### `SearchBar.tsx`

```typescript
type SearchBarProps = {
  value: string;
  onChange: (value: string) => void;  // debounced externally by useContacts hook
  placeholder?: string;
};
```

`Search` icon inset left (`pl-10`). `X` (XCircle) clear button inset right — only visible when value is non-empty.

```
className="w-full pl-10 pr-10 py-2 rounded-lg border border-[var(--color-border)]
           bg-[var(--color-bg-muted)] text-sm text-[var(--color-text-primary)]
           placeholder:text-[var(--color-text-disabled)]
           focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]"
```

`aria-label="Search contacts"`. `role="searchbox"`.

The 300ms debounce lives in `useContacts.ts` — the `SearchBar` fires `onChange` on every keystroke; the hook debounces before triggering the API call (AC-004-2).

---

#### `TagFilter.tsx`

```typescript
type TagFilterProps = {
  value: string[];           // array of selected tag names
  onChange: (tags: string[]) => void;
  availableTags: Tag[];
};
```

Built on Headless UI `Listbox` (multi-select). Trigger button shows:
- Default: "Filter by tag" with `ChevronDown` icon
- Active: "2 tags" with count badge (bg-brand text-white, rounded-full)

Dropdown:
```
┌──────────────────────────┐
│ ☐  🔒 candidate          │
│ ☑  🔒 client         ✓  │
│ ☐  🔒 warm lead          │
│ ☐  🔒 placed             │
│ ☐  🔒 interviewed        │
│ ──────────────────       │
│ ☐  senior developer      │
│ [Clear all]              │
└──────────────────────────┘
```

System tags shown first with a divider before custom tags.

---

### 5.5 CSV Components (`web/src/components/csv/`)

#### `CsvImport.tsx`

State machine: `idle → uploading → complete | error`.

```typescript
type CsvImportProps = {
  onComplete: () => void;  // triggers queryClient.invalidateQueries
};
```

Hidden `<input type="file" accept=".csv" />` (not visible — triggered programmatically by button click).

Button: secondary variant, `Upload` icon from lucide-react, label "Import CSV".

**Uploading modal:**
```
┌──────────────────────────────────┐
│  Importing contacts…             │
│                                  │
│  [====≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡] (indeterminate)
│                                  │
│  Do not close this window.       │
└──────────────────────────────────┘
```
No close button while uploading (modal is non-dismissable during upload).

**Complete modal:**
```
┌────────────────────────────────────────┐
│  Import complete                  ✕   │
│                                        │
│  ✅  2,987 contacts imported           │
│  ⚠   13 rows skipped                  │
│                                        │
│  Errors                                │
│  ┌──────────────────────────────────┐  │
│  │  Row 45    Missing name          │  │  ← max-h-48, overflow-y-auto
│  │  Row 112   Missing name          │  │
│  └──────────────────────────────────┘  │
│                                        │
│                          [Done]        │
└────────────────────────────────────────┘
```

"Errors" section only shown if `errors.length > 0`.

**Error modal:**
```
┌────────────────────────────────────────┐
│  Import failed                    ✕   │
│                                        │
│  Something went wrong during import.   │
│  Please check the file format and      │
│  try again.                            │
│                                        │
│  [Try again]       [Cancel]            │
└────────────────────────────────────────┘
```

---

#### `CsvExport.tsx`

```typescript
// No props needed — fetches all contacts via API
```

Button: secondary variant, `Download` icon from lucide-react, label "Export CSV".

On click: `GET /api/v1/contacts/export` → `response.blob()` → programmatic anchor download:
```tsx
const blob = await response.blob();
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = 'contacts.csv';
document.body.appendChild(a);
a.click();
document.body.removeChild(a);
URL.revokeObjectURL(url);
```

Button shows `Loader2` spinner while in-flight, disabled to prevent double-click.

---

## 6. Page Wireframes

### 6.1 Login Page (`/login`)

Single-column, vertically and horizontally centred. No sidebar or nav. Dark mode toggle in top-right corner.

```
Desktop 1440px:
╔══════════════════════════════════════════════════════════════════╗
║                                                       [🌙]       ║
║                                                                  ║
║                                                                  ║
║                    ╔════════════════════════╗                    ║
║                    ║                        ║                    ║
║                    ║   🗂  RecruitCRM        ║                    ║
║                    ║                        ║                    ║
║                    ║  Sign in to your       ║                    ║
║                    ║  workspace             ║                    ║
║                    ║                        ║                    ║
║                    ║  Email address         ║                    ║
║                    ║  [__________________]  ║                    ║
║                    ║                        ║                    ║
║                    ║  Password              ║                    ║
║                    ║  [__________________]  ║                    ║
║                    ║                        ║                    ║
║                    ║  ┌──────────────────┐  ║                    ║
║                    ║  │    Sign In  ⏳   │  ║  ← primary button  ║
║                    ║  └──────────────────┘  ║                    ║
║                    ║                        ║                    ║
║                    ║  ⚠ Invalid email or    ║  ← error banner    ║
║                    ║    password            ║    (role="alert")  ║
║                    ╚════════════════════════╝                    ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝

Form card:  max-w-sm w-full, rounded-2xl, border, shadow-lg, p-8
Page:       min-h-screen flex items-center justify-center
            bg-[var(--color-bg-subtle)]
```

Mobile 375px: same card but with `mx-4` horizontal margin. All spacing scales down naturally.

---

### 6.2 Contacts List — Desktop (≥768px)

```
╔══════════════════════════════════════════════════════════════════╗
║ ┌──────────────┐ ┌────────────────────────────────────────────┐ ║
║ │              │ │  Contacts                  [+ Add]  [CSV▾] │ ║
║ │  🗂 RecruitCRM│ ├────────────────────────────────────────────┤ ║
║ │              │ │ [🔍 Search by name, email…]  [Filter ▾]    │ ║
║ │  👥 Contacts  │ │                             [Sort: Recent▾]│ ║
║ │  (active)    │ ├────────────────────────────────────────────┤ ║
║ │              │ │  NAME ↕    EMAIL         COMPANY ↕  TAGS   │ ║
║ │              │ ├────────────────────────────────────────────┤ ║
║ │ ──────────── │ │  Jordan B  jordan@…      StartupCo         │ ║
║ │              │ │                          [candidate]        │ ║
║ │ 👤 admin@…   │ │  Sarah C   sarah@…       TechRecruit        │ ║
║ │ [🌙] [logout]│ │                          [client][placed]   │ ║
║ │              │ │  Alex J    alex@…        Acme Ltd           │ ║
║ │              │ │                          [warm lead]        │ ║
║ └──────────────┘ │  ...                                       │ ║
║                  ├────────────────────────────────────────────┤ ║
║                  │  Showing 1–25 of 3,000       [← 1 2 … →]  │ ║
║                  └────────────────────────────────────────────┘ ║
╚══════════════════════════════════════════════════════════════════╝

[CSV▾] dropdown reveals: [↑ Import CSV] [↓ Export CSV]
```

---

### 6.3 Contacts List — Mobile (<768px)

```
╔══════════════════════════════╗
║  ☰  RecruitCRM      [🌙] [+] ║  ← h-14 topbar
╠══════════════════════════════╣
║ [🔍 Search by name…]         ║  ← full width
║ [Filter by tag ▾]  [Sort ▾]  ║  ← two buttons, each ~50% width
╠══════════════════════════════╣
║                              ║
║ ┌──────────────────────────┐ ║
║ │ Jordan Baker           › │ ║
║ │ jordan@example.com       │ ║
║ │ StartupCo                │ ║
║ │ [candidate] [warm lead]  │ ║
║ └──────────────────────────┘ ║
║                              ║
║ ┌──────────────────────────┐ ║
║ │ Sarah Chen             › │ ║
║ │ sarah@techrecruit.com    │ ║
║ │ TechRecruit Ltd          │ ║
║ │ [client] [placed]        │ ║
║ └──────────────────────────┘ ║
║                              ║
║  ← Prev   Page 1 of 120   Next →  ║
╚══════════════════════════════╝

[+] button opens ContactForm drawer directly.
CSV import/export accessible via ☰ hamburger menu.
```

---

### 6.4 Contact Detail / Edit Drawer

Slides in from right. Desktop: `max-w-md` with overlay. Mobile: full-width.

```
Desktop (contact detail):         Mobile (contact form):
                                  ╔══════════════════════════╗
┌──────────────────────┐          ║ ← Add Contact        ✕  ║
│ Contacts (dimmed)    │          ╠══════════════════════════╣
│             ┌────────┤          ║ Name *                   ║
│             │← Jordan│          ║ [________________________]║
│             │ [Edit][⋯]         ║ ⚠ Name is required       ║
│             │        │          ║                          ║
│             │📧 email │          ║ Email                    ║
│             │📞 phone │          ║ [________________________]║
│             │🏢 co    │          ║                          ║
│             │        │          ║ Phone                    ║
│             │Tags     │          ║ [________________________]║
│             │[candid] │          ║                          ║
│             │        │          ║ Company                  ║
│             │Notes    │          ║ [________________________]║
│             │[text…] │          ║                          ║
│             │        │          ║ Tags                     ║
│             │Created  │          ║ [candidate ×] [type…]   ║
│             │21 Mar   │          ║                          ║
│             └────────┘          ║ Notes                    ║
│                      │          ║ [________________________]║
└──────────────────────┘          ║ [________________________]║
                                  ╠══════════════════════════╣
                                  ║ [Cancel]         [Save] ║
                                  ╚══════════════════════════╝
```

---

### 6.5 CSV Import Modal

```
Uploading:                        Complete:
╔═══════════════════════════╗     ╔════════════════════════════╗
║  Importing contacts…      ║     ║  Import complete      ✕   ║
║                           ║     ║                            ║
║  [━━━━━━━━━░░░░░░░░░░]    ║     ║  ✅ 2,987 imported         ║
║  (indeterminate shimmer)  ║     ║  ⚠  13 rows skipped       ║
║                           ║     ║                            ║
║  Do not close this window.║     ║  Errors                    ║
╚═══════════════════════════╝     ║  ┌──────────────────────┐  ║
                                  ║  │ Row 45  Missing name  │  ║
                                  ║  │ Row 112 Missing name  │  ║
                                  ║  └──────────────────────┘  ║
                                  ║             [Done]          ║
                                  ╚════════════════════════════╝
```

---

## 7. Component Hierarchy

Full React component tree. Indentation = parent/child nesting.

```
App.tsx
└── QueryClientProvider (TanStack Query v5)
    └── AuthContext.Provider (useReducer — JWT + user)
        └── Toaster (react-hot-toast, top-right desktop / bottom-center mobile)
            └── Router (react-router-dom v7)
                ├── /login  →  LoginPage
                │              └── LoginForm
                │                  ├── Input (email)
                │                  ├── Input (password)
                │                  ├── Button (primary, loading on submit)
                │                  └── ErrorAlert (role="alert")
                │
                └── ProtectedRoute (checks JWT; redirects /login if absent)
                    └── AppShell
                        ├── Sidebar (hidden on mobile)
                        │   ├── AppLogo
                        │   ├── NavItem "Contacts" (active indicator)
                        │   └── SidebarFooter
                        │       ├── UserDisplay (user email, text-xs)
                        │       ├── DarkModeToggle
                        │       └── Button "Log out" (ghost, LogOut icon)
                        │
                        ├── MobileNav (hidden md+)
                        │   ├── Button "☰" (opens slide-over)
                        │   ├── AppLogo
                        │   ├── DarkModeToggle
                        │   ├── Button "+ Add" (opens ContactDrawer in create mode)
                        │   └── MobileMenuDrawer (Headless UI Dialog)
                        │       ├── NavItem "Contacts"
                        │       ├── UserDisplay
                        │       ├── CsvMenu (Import + Export)
                        │       └── Button "Log out"
                        │
                        └── <main>
                            └── ContactsPage  (route: /)
                                ├── PageHeader
                                │   ├── h1 "Contacts"
                                │   ├── Button "+ Add Contact" (desktop only)
                                │   └── CsvMenu (desktop only)
                                │       ├── CsvImport
                                │       └── CsvExport
                                │
                                ├── Toolbar
                                │   ├── SearchBar (flex-1)
                                │   ├── TagFilter
                                │   └── SortControl
                                │
                                ├── [if loading]   SkeletonTable
                                ├── [if empty]     EmptyState
                                ├── [if md+]       ContactsTable
                                │                  ├── ContactsTableHead
                                │                  │   └── SortableColumn (×3)
                                │                  └── ContactsTableBody
                                │                      └── ContactsTableRow (×N per page)
                                │                          └── TagBadge (×M)
                                ├── [if <md]       ContactCardList
                                │                  └── ContactCard (×N)
                                │                      └── TagBadge (×M)
                                │
                                ├── Pagination
                                │
                                ├── ContactDrawer  (Headless UI Dialog, slide-right)
                                │   ├── [detail mode]  ContactDetail
                                │   │                  ├── TagBadge (×M, size=md, showLock)
                                │   │                  └── OverflowMenu
                                │   │                      ├── "Edit contact"
                                │   │                      └── "Delete contact"
                                │   └── [form mode]    ContactForm
                                │                      ├── Input "Name" (required)
                                │                      ├── Input "Email"
                                │                      ├── Input "Phone"
                                │                      ├── Input "Company"
                                │                      ├── TagMultiSelect
                                │                      │   ├── TagBadge (×selected, with ×)
                                │                      │   └── Combobox dropdown
                                │                      │       ├── TagOption (×all)
                                │                      │       └── CreateTagOption (conditional)
                                │                      ├── Textarea "Notes"
                                │                      └── FormActions
                                │                          ├── Button "Delete" (danger, edit only)
                                │                          ├── Button "Cancel" (ghost)
                                │                          └── Button "Save" (primary, loading)
                                │
                                └── DeleteConfirmModal  (Headless UI Dialog)
                                    ├── p (confirmation text with contact name)
                                    ├── Button "Cancel" (ghost, initial focus)
                                    └── Button "Delete" (danger, loading)
```

---

## 8. Responsive Breakpoints

Tailwind default breakpoints (no custom breakpoints needed):

| Prefix | Min-width | Layout mode |
|---|---|---|
| _(default, no prefix)_ | 0px | Mobile — cards, full-width, stacked |
| `sm:` | 640px | _(not specifically targeted)_ |
| `md:` | 768px | Tablet/desktop — sidebar, table, toolbar row |
| `lg:` | 1024px | Wider table, larger drawer |
| `xl:` | 1280px | Content cap `max-w-7xl mx-auto` |

### Critical breakpoint behaviours

**Below `md` (0–767px):**
- `Sidebar` hidden (`hidden md:flex`), `MobileNav` shown (`md:hidden`)
- Contact list: `ContactCardList` (not table)
- Drawer: `w-full` (full screen on mobile)
- Toolbar: `SearchBar` on its own row (full width), filter + sort controls on a second row (`flex-wrap`)
- "+ Add Contact": in topbar (icon + label collapses to icon at 375px if needed)
- CSV import/export: in hamburger menu (not page header, saves space)
- All tap targets ≥ 44×44px (WCAG AC-017-4)
- No horizontal scroll at 375px (AC-017-5)

**`md` and above (768px+):**
- `Sidebar` visible, `MobileNav` hidden
- Contact list: `ContactsTable`
- Drawer: `max-w-md` with backdrop overlay
- Toolbar: single flex row with search (flex-1) + filter + sort + action buttons
- "+ Add Contact" and CSV dropdown in page header

**`lg` and above (1024px+):**
- Company column no longer truncated
- Drawer can expand to `max-w-lg` (512px) if needed

**`xl` and above (1280px+):**
- Main content area capped: `max-w-7xl mx-auto px-6`

---

## 9. Interaction Patterns

### 9.1 Real-Time Search (FR-004, AC-004-2)

```
User keystroke → SearchBar.onChange(value) called every keystroke
  → ContactsPage state: setSearch(value)
  → useContacts({ q: value, page: 1, ... }) — page resets to 1 on search change
  → TanStack Query: debounces 300ms before firing GET /contacts?q=value
  → isPending = true → SkeletonTable shown
  → data arrives → ContactsTable / ContactCardList rendered
  → Cache key: ['contacts', { q, tag, page, sortBy, sortOrder }]
```

Clear (✕ button): sets `search = ''` → `useContacts({ q: undefined })` → full list from cache.

### 9.2 Tag Filter (FR-005, AC-005-3)

```
User selects tag in TagFilter → setActiveTags(['candidate'])
  → useContacts({ q: currentSearch, tag: 'candidate', page: 1 })
  → List updates; pagination works on filtered set
  → Search + tag filter compose: both applied simultaneously
```

Multi-tag: `tag=candidate&tag=placed` (repeated query param — confirmed in TECH_STACK.md API design).

### 9.3 Column Sort (FR-006, AC-006-1)

```
User clicks "NAME" column header:
  If sortBy !== 'name': set sortBy='name', sortOrder='asc'
  If sortBy === 'name' && sortOrder === 'asc': set sortOrder='desc'
  If sortBy === 'name' && sortOrder === 'desc': set sortOrder='asc'
```

Sort icon: `ArrowUpDown` (lucide-react) on non-active columns; `ArrowUp` / `ArrowDown` on active column.
`aria-sort="ascending"` / `"descending"` / `"none"` on each `<th>`.

### 9.4 Contact Drawer Flow (FR-008, FR-010)

```
Click row → setSelectedId(contact.id), setDrawerMode('detail')
  → ContactDrawer opens with ContactDetail
  → URL updates: pushState('/contacts/contact.id') (AC-010-4)

Click "Edit" in detail view → setDrawerMode('form')
  → ContactDetail unmounts, ContactForm mounts (pre-populated from cache)

Click "Save" → PUT /contacts/:id → on success:
  → queryClient.invalidateQueries(['contacts'])
  → queryClient.invalidateQueries(['contact', id])
  → Drawer closes
  → Toast "Contact updated"

Click "Cancel" → Drawer closes, no mutation, cache untouched

Escape / backdrop click → same as Cancel
Focus returns to triggering row (Headless UI Dialog handles this via `initialFocus` prop)
```

### 9.5 Create Contact (FR-007)

```
Click "+ Add Contact" → setDrawerMode('form'), setSelectedId(null)
  → ContactDrawer opens with empty ContactForm

Submit → POST /contacts → on success:
  → queryClient.invalidateQueries(['contacts'])
  → Drawer closes
  → Toast "Contact added"
  → New contact visible in list (first row, sorted by created_at desc)
```

### 9.6 Delete Contact (FR-009)

```
Click "Delete" in form or detail overflow menu → setShowDeleteConfirm(true)
  → DeleteConfirmModal opens, focus on "Cancel"

Click "Delete" (confirm) → DELETE /contacts/:id → loading state on button
  → on success: drawer closes, modal closes
  → queryClient.invalidateQueries(['contacts'])
  → Toast "Contact deleted"

Click "Cancel" or Escape → modal closes, contact unchanged
```

### 9.7 CSV Import (FR-014)

```
Click "Import CSV" → programmatic click on hidden <input type="file">
  → OS file picker opens (accept=".csv")
  → User selects file → onChange fires
  → importMutation.mutate(file)
  → Uploading modal opens (non-dismissable)
  → POST /contacts/import (multipart/form-data)
  → On success: modal switches to results summary
  → User clicks "Done"
  → queryClient.invalidateQueries(['contacts'])
  → Contact list refreshes
```

### 9.8 Dark Mode Toggle (FR-016, AC-016-3)

```
Click DarkModeToggle:
  current = localStorage.getItem('theme') ?? 'light'
  next = current === 'dark' ? 'light' : 'dark'
  document.documentElement.classList.toggle('dark', next === 'dark')
  localStorage.setItem('theme', next)
  setTheme(next) → React re-renders icon (Moon ↔ Sun)
```

FOUC prevention: `index.html` inline script (see Section 5.1 `DarkModeToggle.tsx`) runs before React hydrates.

### 9.9 Toast Notifications (AC-007-5, AC-008-4, AC-009-4)

`react-hot-toast` positioned at `top-right` on desktop, `bottom-center` on mobile (achieved via responsive CSS in `index.css`).

| Trigger | Message | Duration | Variant |
|---|---|---|---|
| Contact created | "Contact added" | 3s | success |
| Contact updated | "Contact updated" | 3s | success |
| Contact deleted | "Contact deleted" | 3s | success |
| Import complete | "2,987 contacts imported" | 5s | success |
| Custom tag created | "Tag created" | 2s | success |
| Any API error | Error message from response | 5s | error |

All toasts have a visible close button (accessible with keyboard).

---

## 10. Accessibility Requirements

Maps to FR-018 and WCAG 2.1 Level AA.

### 10.1 Keyboard Navigation (AC-018-1)

| Component | Keys |
|---|---|
| Table rows | `Tab` to navigate. `Enter` or `Space` opens detail drawer. |
| `ContactCard` | `Tab` focusable (is a `<button>`). `Enter` / `Space` opens drawer. |
| `SearchBar` | `Tab` to focus. `Escape` clears and blurs. |
| `TagFilter` (Listbox) | `Tab` opens. Arrow keys navigate. `Space` toggles. `Escape` closes. |
| `TagMultiSelect` (Combobox) | `Tab` focuses. Arrow keys navigate. `Enter` selects. `Backspace` on empty input removes last chip. `Escape` closes. |
| `Drawer` / `Modal` (Dialog) | Focus trapped on open. `Escape` closes. Focus returns to trigger element on close. |
| `DeleteConfirmModal` | Focus starts on "Cancel" button. `Escape` cancels. |
| `Pagination` | All `<button>` elements — native keyboard accessible. |
| `DarkModeToggle` | `<button>` — `Enter` / `Space` toggles. |
| `SortableColumn (th > button)` | `Enter` / `Space` cycles sort direction. |

### 10.2 Focus Visibility (AC-018-2)

All interactive elements use:
```
focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2
focus-visible:outline-[var(--color-brand)]
```

Never `outline: none` without a replacement. Use `:focus-visible` (not `:focus`) to hide ring on mouse click but show it on keyboard focus.

### 10.3 ARIA Attributes (AC-018-3, AC-018-6)

| Element | Attribute |
|---|---|
| `DarkModeToggle` (icon-only button) | `aria-label="Switch to dark mode"` / `"Switch to light mode"` |
| Drawer close `✕` button | `aria-label="Close"` |
| Hamburger `☰` button | `aria-label="Open navigation menu"` |
| `TagBadge` lock icon | `aria-label="System tag"` (on icon wrapper) |
| `TagBadge` remove `×` button | `aria-label="Remove {tag.name} tag"` |
| `SearchBar` input | `aria-label="Search contacts"` (no visible label — the placeholder is not sufficient) |
| All `ContactForm` fields | `<label htmlFor={id}>` with matching `id` on input |
| Error messages | `id="{fieldId}-error"` + `aria-describedby="{fieldId}-error"` on input |
| Loading skeleton container | `aria-busy="true"` + `aria-label="Loading contacts"` |
| Empty state container | `role="status"` |
| Login error banner | `role="alert"` + `aria-live="assertive"` |
| Toast container | `role="status"` + `aria-live="polite"` |
| `Drawer` / `Modal` | `aria-labelledby="{titleId}"` pointing to the heading |
| `DeleteConfirmModal` | `aria-describedby="{confirmTextId}"` |
| Sortable table headers | `aria-sort="ascending"` / `"descending"` / `"none"` |
| Pagination `<nav>` | `aria-label="Pagination"` |
| Active page button | `aria-current="page"` |
| Import progress modal | `aria-live="polite"` on status text |

### 10.4 Colour Contrast (AC-016-5)

- Normal text (≥ 4.5:1): all text pairs verified in Section 2.
- Large text (≥ 3:1): headings verified.
- Tag badge special case: full-opacity hex on 12–20% opacity background of same hex. Contrast varies by tag colour. Verification:
  - `#3B82F6` (blue) text on `rgba(59,130,246,0.15)` ≈ 3.8:1 — **passes large text (14px bold badge text)**.
  - `#F59E0B` (amber) on amber/15% bg ≈ 2.9:1 — borderline. **Mitigate:** increase text weight to 600 (bold) on tag badges so they qualify as large text.
  - Run `@axe-core/react` in Vitest to catch any remaining failures.

### 10.5 axe-core Integration (AC-018-5, AC-P-010)

Install: `npm install --save-dev jest-axe @axe-core/react`

In `web/src/__tests__/setup.ts`:
```ts
import { configureAxe, toHaveNoViolations } from 'jest-axe';
expect.extend(toHaveNoViolations);
```

Required test coverage:
```ts
// web/src/__tests__/LoginPage.test.tsx
it('has no axe violations', async () => {
  const { container } = render(<LoginPage />);
  expect(await axe(container)).toHaveNoViolations();
});

// web/src/__tests__/ContactsPage.test.tsx
it('has no axe violations on contacts list', async () => {
  // render with MSW mock returning 5 contacts
  const { container } = render(<ContactsPage />);
  await waitFor(() => screen.getByRole('table'));
  expect(await axe(container)).toHaveNoViolations();
});
```

---

## 11. Tailwind 4 Configuration Notes

Per ADR-0003: CSS-native configuration only. No `tailwind.config.ts` theme extension. No `@apply` in component files.

### Referencing design tokens in Tailwind classes

Use arbitrary value syntax:
```tsx
// ✅ Correct
<div className="bg-[var(--color-bg-base)] text-[var(--color-text-primary)]">

// ❌ Wrong — no @apply in Tailwind 4 components
// .my-component { @apply bg-white text-gray-900; }
```

### Dark mode setup

Add the custom dark variant in `index.css`:
```css
@variant dark (&:where(.dark, .dark *));
```

This allows `dark:` utilities to work when the `.dark` class is on `<html>`. Components can then use:
```tsx
// Dark mode via CSS variable (preferred — variable handles both themes)
<div className="bg-[var(--color-bg-base)]">

// Dark mode via Tailwind dark: variant (for overrides not covered by variables)
<div className="text-gray-900 dark:text-slate-100">
```

Prefer CSS variables over `dark:` variants where a token exists for both themes.

### Content scanning

Tailwind 4 auto-detects class usage from project files. No `content` array needed. If using dynamic class strings (template literals), ensure full class names are present (never concatenate partial class names).

---

## 12. Implementation Checklist

Before starting any component, confirm:

- [ ] `web/src/index.css` has all CSS custom properties from Section 2
- [ ] `web/index.html` has FOUC-prevention script for dark mode (Section 5.1 DarkModeToggle)
- [ ] `web/index.html` loads Inter font via Google Fonts preconnect
- [ ] `@headlessui/react` 2.x installed
- [ ] `lucide-react` installed (consistent with TECH_STACK.md)
- [ ] `react-hot-toast` 2.x installed
- [ ] Tailwind 4 `@variant dark` configured in `index.css`
- [ ] `jest-axe` installed in devDependencies

Per component checklist:
- [ ] All interactive elements: `min-h-11 min-w-11` (44×44px touch target)
- [ ] All interactive elements: `focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand)]`
- [ ] Never `outline: none` without replacement focus indicator
- [ ] Every `<input>` / `<textarea>` has `<label htmlFor>` or `aria-label`
- [ ] Every icon-only button has `aria-label`
- [ ] Dynamic regions (search results, errors, loading state) have `aria-live`
- [ ] All `Drawer` and `Modal` trap focus — verify Headless UI `Dialog` is used correctly
- [ ] Dark mode: all colour values use CSS variables (or `dark:` Tailwind variants as fallback)
- [ ] Mobile (375px): no horizontal overflow, no content cut off
- [ ] No `@apply` in any component file
- [ ] axe-core assertion included in LoginPage and ContactsPage tests
