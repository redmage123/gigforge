# AI Signals + Alerts Panel Spec

**Story:** STORY-005
**Author:** UX Designer (retrofit 2026-04-27)
**Date:** 2026-03-22
**Implementation:** `src/pages/Signals.tsx` (118 lines), `src/pages/Alerts.tsx` (116 lines)

---

## Goal

Two related but distinct surfaces:

- **/signals** — AI-generated trading signals with direction, confidence, and
  natural-language reasoning. Listed reverse-chronologically with filters.
- **/alerts** — User-configured price/volume thresholds that have fired or are
  pending. Less time-sensitive; presented as configurable cards.

Both share the `Panel` shell + `Badge` UI primitives + filter-button row pattern.

---

## /signals — layout

```
┌────────────────────────────────────────────────────┐
│ [SignalSearchBar — query, direction, minConf]      │  Sprint 4 addition
│                                                    │
│ AI Trading Signals                                 │
│ [ALL*] [BUY] [SELL] [HOLD]                         │
│                                                    │
│  ┌──────────────────────────────────────────────┐  │
│  │ BTC  [BUY]                       3m ago      │  │
│  │ Confidence:  ████████░░  82%                 │  │
│  │ "RSI below 30; on-chain accumulation..."     │  │
│  └──────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────┐  │
│  │ ETH  [HOLD]                      8m ago      │  │
│  │ Confidence:  ██████░░░░  61%                 │  │
│  │ "Price consolidating $3.1-3.3k..."           │  │
│  └──────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────┘
```

### SignalCard

- Header row: asset symbol (monospace bold, **clickable** — opens
  `AssetDetailModal`), direction `Badge`, relative timestamp.
- Confidence bar: 6-px height fill bar.
  - `confidence ≥ 75` → green fill
  - `confidence 50-74` → amber fill
  - `confidence < 50`  → red fill
- Reason: full text, `text-secondary`, no truncation (signals are short).
- `aria-progressbar` on the confidence fill with `aria-valuenow={confidence}`.

### Filter buttons

- Pill group: `ALL | BUY | SELL | HOLD`.
- Active: `bg-accent text-white`. Inactive: `bg-bg-elevated text-text-secondary`.
- `aria-pressed` on each.

---

## /alerts — layout

```
┌────────────────────────────────────────────────────┐
│ Active Alerts                                      │
│ [ALL*] [PRICE] [VOLUME]                            │
│                                                    │
│  ┌──────────────────────────────────────────────┐  │
│  │ 🔔 BTC > $52,000                   ACTIVE    │  │
│  │ Notify when BTC closes above $52,000          │  │
│  │ Created 2 days ago                            │  │
│  └──────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────┐  │
│  │ 🔔 ETH 24h volume > $5B           TRIGGERED  │  │
│  │ Triggered 14 minutes ago                      │  │
│  └──────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────┘
```

- Status `Badge` per card: `ACTIVE` (neutral), `TRIGGERED` (positive), `EXPIRED` (muted).
- Filter group: `ALL | PRICE | VOLUME`.

---

## Shared rules

- Both pages use `Panel` shell.
- Both pages handle loading via `LoadingSkeleton rows={6}`, error via
  `ErrorBanner`, empty via `EmptyState` with type-specific copy.
- Lists scroll within the panel; the panel header stays sticky.

---

## Acceptance criteria — signals

- [x] Filter buttons toggle between ALL/BUY/SELL/HOLD.
- [x] SignalCard shows asset, direction badge, confidence bar (color-coded by tier), reason, relative time.
- [x] Asset symbol is clickable and opens `AssetDetailModal` (Sprint 4 addition).
- [x] `SignalSearchBar` is mounted at the top of the page (Sprint 4 addition).
- [x] Confidence bar has correct ARIA attributes for screen readers.

## Acceptance criteria — alerts

- [x] Filter buttons toggle between ALL/PRICE/VOLUME.
- [x] Each alert card shows the trigger condition, status badge, and relative time.
- [x] Empty state renders `EmptyState` with copy specific to the active filter.
