# BACSWN SkyWatch Bahamas — Sprint 1 Plan
**Status:** IN PROGRESS — Stories 1–6 implemented; awaiting QA + Advocate review
**Sprint Dates:** 2026-03-15 → 2026-03-22
**PM:** gigforge-pm
**Kickoff:** 2026-03-15 04:23 UTC

---

## Sprint Goal

Make BACSWN visually stunning and demo-ready for Caribbean aviation authorities. The dashboard must be impressive enough to close deals on a live walkthrough — rich maps, real-time animations, compelling data visualizations, and a clear 7-agent pipeline story.

**Definition of Done:**
- Hurricane tracking map is the undeniable wow factor — animated storm path, surge overlay, evacuation zones
- Live METAR/TAF/flight data renders in real time with smooth UI updates
- 7-agent pipeline demo flow works end-to-end with visible agent activity
- All major pages load without errors or blank states
- A demo script exists so anyone can run the walkthrough confidently

---

## Context

BACSWN is a **demo application** targeting Caribbean aviation authorities (NEMA, GCAA/CAD, etc.) as potential customers. It showcases a distributed AI agent network for Bahamas airspace weather monitoring, hurricane response, and emergency dispatch.

Demo users: `admin` / `admin` and `meteorologist` / `weather` (by design — zero-config for demos).

---

## Sprint Backlog

### P0 — WOW FACTOR (must land before any demo)

#### Story 1 — Hurricane Map: Animated Storm Track + Surge Overlay
**Assigned:** gigforge-dev-frontend
**Estimate:** L (8–16h)
**Priority:** P0

**User Story:**
> As a demo viewer, I want to see a hurricane approaching the Bahamas with an animated storm track, intensity cone, storm surge overlay, and real-time wind field visualization, so that I immediately understand the power of the BACSWN system.

**Acceptance Criteria:**
- [x] Animated storm track line draws progressively from past positions to current to forecast cone
- [x] Forecast cone (uncertainty envelope) rendered as a semi-transparent polygon
- [x] Storm surge risk overlay as a choropleth layer (color-coded by severity: low/moderate/high/extreme)
- [x] Wind field radius circles: 34kt / 50kt / 64kt rings rendered around storm center
- [x] Current storm intensity badge: category label (CAT 1–5 / TS / TD), wind speed, pressure
- [x] Evacuation zones visible as distinct polygon layers with zone labels (Zone A/B/C)
- [x] Island labels visible on the map for orientation (Nassau, Freeport, Exuma, etc.)
- [x] Animation plays on page load — no click required for wow effect
- [x] Smooth 60fps animation — no jank

**Files:** `frontend/src/pages/HurricaneOps.jsx`, `frontend/src/components/map/`

---

#### Story 2 — Live Flight Map: Real-Time Aircraft Positions
**Assigned:** gigforge-dev-frontend
**Estimate:** M (4–8h)
**Priority:** P0

**User Story:**
> As a demo viewer, I want to see live aircraft positions over the Bahamas FIR updating in real time with aircraft icons, callsigns, altitude, and track lines, so that the flight tracking capability is immediately visible.

**Acceptance Criteria:**
- [x] Aircraft rendered as directional icons (rotated to true track heading)
- [x] On hover/click: callsign, altitude (FL), speed (kts), origin country, category
- [x] Smooth position interpolation between WebSocket updates (no teleporting aircraft)
- [x] Track lines showing recent flight path (last 5 positions as fading trail)
- [x] Aircraft count badge in corner: "N aircraft in Bahamas FIR"
- [x] Color coding: commercial (blue), private (green), military (red), unknown (grey)
- [x] Bahamas FIR boundary polygon visible as a subtle overlay
- [x] Auto-updates every 10 seconds without page interaction

**Files:** `frontend/src/pages/FlightOps.jsx`, `frontend/src/components/flights/`

---

#### Story 3 — Watch Office: Live Weather Tiles + METAR Cards
**Assigned:** gigforge-dev-frontend
**Estimate:** M (4–8h)
**Priority:** P0

**User Story:**
> As a demo viewer, I want to see live METAR data for all 15 Bahamas stations displayed as an interactive map with color-coded flight categories (VFR/MVFR/IFR/LIFR) and expandable station cards, so that the weather monitoring capability is immediately clear.

**Acceptance Criteria:**
- [x] All 15 ICAO stations shown as map markers, color-coded by flight category
  - VFR: green, MVFR: blue, IFR: red, LIFR: magenta
- [x] Station marker shows: ICAO code, temp, wind, visibility at a glance
- [x] Click station: expands to full METAR card (raw text + decoded fields)
- [x] TAF strip below METAR card when available — 24h forecast periods color-coded
- [x] "Last updated" timestamp + auto-refresh every 2 minutes
- [x] Stations with stale/missing data shown with a grey "no report" marker
- [x] Wind barbs or directional arrow on each marker

**Files:** `frontend/src/pages/WatchOffice.jsx`, `frontend/src/components/weather/`

---

### P1 — DEMO FLOW (makes the pitch land)

#### Story 4 — Agent Console: Live Pipeline Visualization
**Assigned:** gigforge-dev-frontend
**Estimate:** M (4–8h)
**Priority:** P1

**User Story:**
> As a sales presenter, I want to show the 7-agent AI pipeline running in real time — each agent lighting up as it activates, passing data to the next agent, with a live activity log — so that prospects immediately grasp the autonomous intelligence of BACSWN.

**Acceptance Criteria:**
- [x] Pipeline diagram showing all 7 agents in their flow order with connection arrows
- [x] Each agent node shows: name, status (idle/active/alert), last action, timestamp
- [x] When an agent fires: the node pulses/glows and the connection to next agent animates
- [x] Live activity feed below pipeline: scrolling log of agent decisions (last 20 entries)
- [x] Activity entries include: agent name badge (color-coded), action description, severity dot
- [x] "Trigger Demo Run" button: fires a simulated hurricane alert through all agents, showing each step
- [x] Mobile-friendly layout — works on a tablet during a demo

**Files:** `frontend/src/pages/AgentConsole.jsx`, `frontend/src/components/agents/`

---

#### Story 5 — SIGMET Display: Generated Advisories with ICAO Formatting
**Assigned:** gigforge-dev-frontend
**Estimate:** S (2–4h)
**Priority:** P1

**User Story:**
> As a demo viewer, I want to see AI-generated SIGMET advisories displayed with their ICAO raw text, validity window, hazard type badge, and map overlay, so that the aviation safety workflow is clear.

**Acceptance Criteria:**
- [ ] SIGMET list shows most recent advisories (status badge: draft/active/expired)
- [ ] Each advisory: hazard type icon, severity badge, valid_from → valid_to timeline bar
- [ ] Expandable raw ICAO text block (monospace font)
- [ ] "Generate SIGMET" form: hazard type dropdown, severity, FL range, valid hours — submits to API
- [ ] New advisory appears in list immediately after generation
- [ ] Map overlay: advisory area shown as polygon on the Bahamas FIR map

**Files:** `frontend/src/pages/WatchOffice.jsx` (SIGMET tab), `api/sigmet.py`

---

#### Story 6 — Dashboard Overview: KPI Cards + Activity Feed
**Assigned:** gigforge-dev-frontend
**Estimate:** M (4–8h)
**Priority:** P1

**User Story:**
> As a demo presenter opening the app for the first time, I want a Command Center home page that immediately shows the health of the entire Bahamas airspace — weather alerts, active flights, agent status, and recent incidents — so the first screen makes an impression.

**Acceptance Criteria:**
- [ ] KPI row: Active Flights | Weather Stations Online | Open Incidents | SIGMETs Active | Agents Running
- [ ] Each KPI card: large number, trend indicator (up/down/stable), color-coded status
- [ ] Live mini-map showing Bahamas with active flights and station markers
- [ ] Recent incidents feed (last 5, with severity badge and timestamp)
- [ ] Agent status row: all 7 agent nodes with green/amber/red health indicators
- [ ] Auto-refreshes every 30 seconds

**Files:** `frontend/src/pages/CommandCenter.jsx`

---

#### Story 7 — Demo Script & Walkthrough Guide
**Assigned:** gigforge-pm
**Estimate:** S (2–4h)
**Priority:** P1

**User Story:**
> As a sales presenter, I want a step-by-step demo script that walks through BACSWN's key features in a compelling narrative arc, so that I can run a confident 20-minute demo for aviation authority stakeholders.

**Acceptance Criteria:**
- [ ] Saved at `docs/demo-script.md`
- [ ] Covers: login → Command Center overview → hurricane scenario → agent pipeline → SIGMET generation → flight ops → dispatch simulation
- [ ] Each step: what to click, what to say, expected wow reaction
- [ ] Includes likely objections + responses
- [ ] Notes which features are live data vs simulated (so presenter stays honest)
- [ ] Total demo runtime: 15–20 minutes

---

### P2 — POLISH (if time allows)

#### Story 8 — Animations & Visual Refinements
**Assigned:** gigforge-dev-frontend
**Estimate:** M (4–8h)
**Priority:** P2

- Loading skeletons on all data-fetching components (no blank flash on load)
- Smooth page transitions between routes
- Dark theme refinements: consistent color palette, no harsh whites
- Emergency/alert banners animate in from top with sound option
- Chart animations on data update (not just on initial load)
- Responsive layout tested on 13" laptop and iPad Pro (demo hardware)

---

#### Story 9 — Emissions Dashboard: CORSIA Visualization
**Assigned:** gigforge-dev-frontend
**Estimate:** S (2–4h)
**Priority:** P2

- Bar chart: CO2 by aircraft category (heavy/large/medium/small)
- Line chart: emissions over time (last 24h)
- Top 10 emitters table with airline badge
- "Current Period" summary card with total CO2, total flights, methodology label

**Files:** `frontend/src/pages/Emissions.jsx`

---

## Sprint Schedule

| Story | Assignee | Priority | Estimate |
|-------|----------|----------|----------|
| Story 1 — Hurricane map animation | gigforge-dev-frontend | P0 | L |
| Story 2 — Live flight map | gigforge-dev-frontend | P0 | M |
| Story 3 — Watch Office weather tiles | gigforge-dev-frontend | P0 | M |
| Story 4 — Agent console pipeline viz | gigforge-dev-frontend | P1 | M |
| Story 5 — SIGMET display | gigforge-dev-frontend | P1 | S |
| Story 6 — Command Center KPIs | gigforge-dev-frontend | P1 | M |
| Story 7 — Demo script | gigforge-pm | P1 | S |
| Story 8 — Animations & polish | gigforge-dev-frontend | P2 | M |
| Story 9 — Emissions dashboard | gigforge-dev-frontend | P2 | S |

Work order: Stories 1, 2, 3 in parallel (all P0) → Stories 4, 5, 6 → Story 7 → P2 if time.

---

## What We Are NOT Doing This Sprint

- Security hardening (demo app — admin/admin is fine)
- Test coverage / pytest suite
- Production scalability (SQLite is fine for demos)
- Fixing simulated dispatch channels (simulated is fine for demos)
- WebSocket authentication
- SQL injection fixes
- Debug script cleanup

These are deferred to a future sprint if BACSWN progresses to a production contract.

---

## Approval Gate

Both reviewers must approve before sprint is marked done:
- **gigforge-qa** — visual QA: does it look great? Does the demo flow work end-to-end without errors?
- **gigforge-advocate** — plays the role of a Caribbean aviation authority evaluator: is this convincing?

---

## Previously Applied Fixes (kept — zero demo impact)

- `.gitignore` — prevents runtime artifacts from being accidentally committed
- `.env.example` — documents all config variables with placeholders
- `services/sigmet_generator.py` — `valid_to` now correctly calculates as `valid_from + valid_hours`
